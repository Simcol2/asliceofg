import pkg from 'square';
import crypto from 'crypto';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourceId, orderId, amountCents, currency, customerId, email } = req.body;

  if (!sourceId || !orderId || !amountCents) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof amountCents !== 'number' || amountCents <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const response = await client.payments.create({
      sourceId,
      orderId,
      amountMoney: {
        amount: BigInt(amountCents),
        currency: currency || 'CAD',
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      customerId: customerId || undefined,
      buyerEmailAddress: email || undefined,
      idempotencyKey: crypto.randomUUID(),
    });

    const payment = response.payment;
    return res.status(200).json({
      paymentId: payment.id,
      status: payment.status,
      receiptUrl: payment.receiptUrl,
    });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ error: 'Payment failed' });
  }
}
