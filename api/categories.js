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
    const categories = [];
    for await (const obj of await client.catalog.list({ types: 'CATEGORY' })) {
      if (!obj.isDeleted) {
        categories.push({
          id: obj.id,
          name: obj.categoryData?.name || 'Uncategorized',
        });
      }
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ categories });

  } catch (error) {
    console.error('Categories error:', error);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
}
