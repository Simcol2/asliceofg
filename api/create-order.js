import { Client, Environment } from 'square';
import crypto from 'crypto';

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cartItems, customerId } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Validate each cart item has required fields
  for (const item of cartItems) {
    if (!item.variationId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
  }

  try {
    const { result } = await client.ordersApi.createOrder({
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        customerId: customerId || undefined,
        lineItems: cartItems.map(item => ({
          catalogObjectId: item.variationId,
          quantity: String(item.quantity),
        })),
      },
      idempotencyKey: crypto.randomUUID(),
    });

    const order = result.order;
    return res.status(200).json({
      orderId: order.id,
      totalCents: Number(order.totalMoney?.amount ?? 0),
      currency: order.totalMoney?.currency || 'CAD',
    });

  } catch (error) {
    console.error('Order error:', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
}
