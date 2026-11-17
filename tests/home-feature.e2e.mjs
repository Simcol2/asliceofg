// Browser checks for the home page rotating feature. Run: node tests/home-feature.e2e.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {start} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const shots=process.env.SHOT_DIR||'';
const {server,url}=await start();const browser=await chromium.launch();
async function open(options={}){
  const context=await browser.newContext({viewport:{width:1280,height:900},...options});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  await page.route('**/api/**',r=>r.fulfill({json:{}}));
  await page.clock.install();
  await page.goto(url+'/');
  await page.waitForSelector('#hf-dots button');
  return {page,errors,context};
}
const active=page=>page.locator('.hf-slide:not([hidden]) .hf-title').innerText();

let run=await open();let page=run.page;
assert.equal((await page.content()).toLowerCase().includes('thanksgiving'),false,'Thanksgiving promo still on the home page');
assert.equal(await active(page),'The Likkle Sweet Shop.');
assert.equal(await page.getAttribute('.hf-slide:not([hidden]) .hf-cta','href'),'/book-rum-cake-cart');
assert.ok((await page.locator('.hf-slide:not([hidden]) .hf-cta').innerText()).toUpperCase().startsWith('BOOK THE CART'));
assert.ok(await page.evaluate(()=>{const i=document.querySelector('.hf-visual img');return i.complete&&i.naturalWidth>0;}),'cart photo did not load');
if(shots)await page.screenshot({path:`${shots}/home-feature-cart.png`,clip:{x:0,y:(await page.locator('#home-feature').boundingBox()).y,width:1280,height:760},fullPage:true});
// Rotates on its own to the Christmas placeholder and back.
await page.clock.fastForward(7100);
assert.equal(await active(page),'Christmas, soaked in rum.');
assert.ok((await page.locator('.hf-slide:not([hidden]) .hf-placeholder').innerText()).toUpperCase().includes('CHRISTMAS PROMO'));
if(shots)await page.screenshot({path:`${shots}/home-feature-christmas.png`,clip:{x:0,y:(await page.locator('#home-feature').boundingBox()).y,width:1280,height:760},fullPage:true});
await page.clock.fastForward(7100);
assert.equal(await active(page),'The Likkle Sweet Shop.');
// Pause stops rotation; manual controls still work; Play resumes.
await page.click('#hf-pause');await page.mouse.move(5,5);await page.evaluate(()=>document.activeElement.blur());
assert.equal(await page.getAttribute('#hf-pause','aria-pressed'),'true');
await page.clock.fastForward(30000);
assert.equal(await active(page),'The Likkle Sweet Shop.');
await page.click('#hf-next');
assert.equal(await active(page),'Christmas, soaked in rum.');
assert.equal(await page.getAttribute('#hf-dots button:nth-child(2)','aria-current'),'true');
await page.click('#hf-pause');await page.mouse.move(5,5);await page.evaluate(()=>document.activeElement.blur());
await page.clock.fastForward(7100);
assert.equal(await active(page),'The Likkle Sweet Shop.');
// The button leads to the order form.
await page.click('.hf-slide:not([hidden]) .hf-cta');await page.waitForURL('**/book-rum-cake-cart');
assert.deepEqual(run.errors,[]);await run.context.close();

// Reduced motion: no automatic rotation. Mobile: no horizontal overflow.
run=await open({reducedMotion:'reduce',viewport:{width:375,height:740}});page=run.page;
await page.clock.fastForward(30000);
assert.equal(await active(page),'The Likkle Sweet Shop.');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,'horizontal overflow on mobile');
if(shots)await page.locator('#home-feature').screenshot({path:`${shots}/home-feature-mobile.png`});
await run.context.close();
await browser.close();server.close();console.log('home feature OK');
