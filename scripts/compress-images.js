/**
 * compress-images.js
 *
 * Compresses new/unprocessed images in public/images/.
 * Tracks processed files in public/images/.compressed-manifest.json
 * so images are only compressed once — re-running is safe.
 *
 * Usage: npm run compress
 */

import sharp from 'sharp';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const IMAGES_DIR     = 'public/images';
const MANIFEST_PATH  = join(IMAGES_DIR, '.compressed-manifest.json');
const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Quality settings per format
const QUALITY = { jpg: 82, png: 80, webp: 82 };

// ─── Load manifest ────────────────────────────────────────
let manifest = {};
if (existsSync(MANIFEST_PATH)) {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    manifest = {};
  }
}

// ─── Get file hash (based on size + mtime — fast, no full read) ──────────────
function fileSignature(filePath) {
  const stat = statSync(filePath);
  return `${stat.size}-${stat.mtimeMs}`;
}

// ─── Process images ───────────────────────────────────────
const files = readdirSync(IMAGES_DIR).filter(f => {
  const ext = extname(f).toLowerCase();
  return SUPPORTED_EXTS.has(ext) && !f.startsWith('.');
});

if (!files.length) {
  console.log('No images found in', IMAGES_DIR);
  process.exit(0);
}

let compressed = 0;
let skipped    = 0;
const errors   = [];

for (const file of files) {
  const filePath  = join(IMAGES_DIR, file);
  const signature = fileSignature(filePath);

  if (manifest[file] === signature) {
    console.log(`  skip  ${file} (already compressed)`);
    skipped++;
    continue;
  }

  const ext = extname(file).toLowerCase().replace('.', '');
  const outPath = filePath; // compress in-place

  try {
    const input     = readFileSync(filePath);
    const origBytes = input.length;
    let output;

    if (ext === 'png') {
      output = await sharp(input)
        .png({ quality: QUALITY.png, compressionLevel: 9 })
        .toBuffer();
    } else if (ext === 'webp') {
      output = await sharp(input)
        .webp({ quality: QUALITY.webp })
        .toBuffer();
    } else {
      // jpg / jpeg
      output = await sharp(input)
        .jpeg({ quality: QUALITY.jpg, progressive: true, mozjpeg: true })
        .toBuffer();
    }

    if (output.length < origBytes) {
      writeFileSync(outPath, output);
      const saved = ((1 - output.length / origBytes) * 100).toFixed(1);
      console.log(`  ✓  ${file}  ${(origBytes / 1024).toFixed(0)}KB → ${(output.length / 1024).toFixed(0)}KB  (${saved}% saved)`);
    } else {
      console.log(`  ✓  ${file}  already optimal, kept original`);
    }

    // Update manifest with new signature AFTER writing
    manifest[file] = fileSignature(outPath);
    compressed++;

  } catch (err) {
    console.error(`  ✗  ${file}  failed: ${err.message}`);
    errors.push(file);
  }
}

// ─── Save manifest ────────────────────────────────────────
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log(`\nDone. ${compressed} compressed, ${skipped} skipped${errors.length ? `, ${errors.length} failed` : ''}.`);
if (errors.length) {
  console.error('Failed files:', errors.join(', '));
  process.exit(1);
}
