import pkg from 'square';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Collect all pages of catalog objects
    const objects = [];
    for await (const obj of await client.catalog.list({ types: 'ITEM,IMAGE' })) {
      objects.push(obj);
    }

    const imageMap = {};
    objects
      .filter(o => o.type === 'IMAGE')
      .forEach(img => {
        imageMap[img.id] = img.imageData?.url;
      });

    // Items that exist in Square's API but should never appear on the storefront
    const BLOCKED_ITEM_NAMES = ['cravins rum cake bites'];

    const items = objects
      .filter(o =>
        o.type === 'ITEM' &&
        !o.isDeleted &&
        !o.itemData?.isArchived &&
        !BLOCKED_ITEM_NAMES.includes((o.itemData?.name || '').toLowerCase().trim())
      )
      .map(item => {
        const data = item.itemData;
        return {
          id: item.id,
          name: data.name,
          description: data.description || '',
          // Collect all category IDs so items with multiple categories are found correctly
          categoryIds: [
            ...(data.categories || []).map(c => c.id),
            ...(data.categoryId ? [data.categoryId] : []),
          ].filter((id, i, arr) => id && arr.indexOf(id) === i),
          imageUrl: data.imageIds?.length ? imageMap[data.imageIds[0]] : null,
          imageUrls: (data.imageIds || []).map(id => imageMap[id]).filter(Boolean),
          variations: (data.variations || []).map(v => ({
            id: v.id,
            name: v.itemVariationData?.name || 'Regular',
            priceCents: Number(v.itemVariationData?.priceMoney?.amount ?? 0),
            currency: v.itemVariationData?.priceMoney?.currency || 'CAD',
          })),
        };
      });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ items });

  } catch (error) {
    console.error('Catalog error:', error);
    return res.status(500).json({ error: 'Failed to load catalog' });
  }
}
