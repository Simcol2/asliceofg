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

  const { customerId } = req.query;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId required' });
  }

  try {
    const response = await client.orders.search({
      locationIds: [process.env.SQUARE_LOCATION_ID],
      query: {
        filter: {
          customerFilter: { customerIds: [customerId] },
          stateFilter: { states: ['COMPLETED'] },
        },
        sort: { sortField: 'CREATED_AT', sortOrder: 'DESC' },
      },
    });

    const orders = (response.orders || []).map(o => ({
      orderId: o.id,
      createdAt: o.createdAt,
      totalCents: Number(o.totalMoney?.amount ?? 0),
      currency: o.totalMoney?.currency || 'CAD',
      lineItems: (o.lineItems || []).map(li => ({
        name: li.name,
        quantity: li.quantity,
        totalCents: Number(li.totalMoney?.amount ?? 0),
      })),
    }));

    return res.status(200).json({ orders });

  } catch (error) {
    console.error('Orders error:', error);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
}
