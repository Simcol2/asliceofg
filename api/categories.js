import { Client, Environment } from 'square';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { result } = await client.catalogApi.listCatalog(undefined, 'CATEGORY');
    const categories = (result.objects || [])
      .filter(o => !o.isDeleted)
      .map(o => ({
        id: o.id,
        name: o.categoryData?.name || 'Uncategorized',
      }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ categories });

  } catch (error) {
    console.error('Categories error:', error);
    return res.status(500).json({ error: 'Failed to load categories' });
  }
}
