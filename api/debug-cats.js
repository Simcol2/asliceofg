import pkg from 'square';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export default async function handler(req, res) {
  const categories = [];
  for await (const obj of await client.catalog.list({ types: 'CATEGORY' })) {
    if (!obj.isDeleted) {
      const name = obj.categoryData?.name || '';
      categories.push({
        id: obj.id,
        name,
        nameChars: [...name].map(c => c.charCodeAt(0)),
        nameLower: name.toLowerCase().trim(),
      });
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ categories });
}
