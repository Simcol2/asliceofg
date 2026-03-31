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

  const { cartItems, fulfillmentType, fulfillmentDate } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  for (const item of cartItems) {
    if (!item.variationId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
  }

  const type = fulfillmentType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';

  // Build a noon timestamp on the requested date (or tomorrow if none given)
  let scheduledDate = fulfillmentDate ? new Date(fulfillmentDate) : new Date();
  if (!fulfillmentDate) scheduledDate.setDate(scheduledDate.getDate() + 1);
  scheduledDate.setUTCHours(12, 0, 0, 0);
  const scheduledAt = scheduledDate.toISOString();

  const fulfillment = type === 'PICKUP'
    ? {
        type: 'PICKUP',
        pickupDetails: {
          scheduleType: 'SCHEDULED',
          pickupAt: scheduledAt,
          recipient: { displayName: 'Customer' },
        },
      }
    : {
        type: 'DELIVERY',
        deliveryDetails: {
          scheduleType: 'SCHEDULED',
          deliverAt: scheduledAt,
          recipient: { displayName: 'Customer' },
        },
      };

  try {
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: cartItems.map(item => ({
          catalogObjectId: item.variationId,
          quantity: String(item.quantity),
        })),
        fulfillments: [fulfillment],
      },
      checkoutOptions: {
        enableCoupon: false,
        enableLoyalty: false,
        acceptedPaymentMethods: {
          applePay: true,
          googlePay: true,
          cashAppPay: false,
          afterpayClearpay: false,
        },
      },
    });

    const url = response.paymentLink?.url || response.paymentLink?.longUrl;

    if (!url) {
      throw new Error('No checkout URL returned from Square');
    }

    return res.status(200).json({ url });

  } catch (error) {
    console.error('Checkout error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
