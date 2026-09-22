import pkg from 'square';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  try {
    const { order } = await client.orders.get({ orderId });

    // Try to get customer email from tenders or fulfillment recipient
    let email = null;
    const recipient = order.fulfillments?.[0]?.pickupDetails?.recipient
      || order.fulfillments?.[0]?.shipmentDetails?.recipient;
    if (recipient?.emailAddress) email = recipient.emailAddress;

    // If no email on order yet, try fetching customer record
    if (!email && order.customerId) {
      try {
        const { customer } = await client.customers.get({ customerId: order.customerId });
        email = customer?.emailAddress || null;
      } catch {}
    }

    // Estimated delivery: use pickup/ship date if set, otherwise 7 days from now
    let estimatedDeliveryDate = null;
    const pickupAt = order.fulfillments?.[0]?.pickupDetails?.pickupAt;
    const shipAt = order.fulfillments?.[0]?.shipmentDetails?.expectedShippedAt;
    const rawDate = pickupAt || shipAt;
    if (rawDate) {
      estimatedDeliveryDate = new Date(rawDate).toISOString().split('T')[0];
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      estimatedDeliveryDate = d.toISOString().split('T')[0];
    }

    const country = order.fulfillments?.[0]?.type === 'SHIPMENT' ? 'CA' : 'CA';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ orderId, email, estimatedDeliveryDate, country });

  } catch (err) {
    console.error('order-confirm error:', err?.message);
    return res.status(500).json({ error: 'Could not fetch order' });
  }
}
