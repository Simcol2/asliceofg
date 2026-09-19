import pkg from 'square';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export default async function handler(req, res) {
  const objects = [];
  for await (const obj of await client.catalog.list({ types: 'ITEM' })) {
    if (!obj.isDeleted && !obj.itemData?.isArchived) {
      const d = obj.itemData;
      objects.push({
        name: d.name,
        categoryId: d.categoryId || null,
        categories: d.categories || [],
        reportingCategory: d.reportingCategory || null,
      });
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ items: objects });
}
