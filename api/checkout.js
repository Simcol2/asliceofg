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

  // Build fulfillment object for the order
  const fulfillments = [];
  if (fulfillmentType && fulfillmentDate) {
    // Construct an RFC 3339 timestamp for the requested date (noon local time)
    const scheduleTime = new Date(`${fulfillmentDate}T12:00:00`).toISOString();

    if (fulfillmentType === 'PICKUP') {
      fulfillments.push({
        type: 'PICKUP',
        pickupDetails: {
          scheduleType: 'SCHEDULED',
          pickupAt: scheduleTime,
        },
      });
    } else if (fulfillmentType === 'DELIVERY') {
      fulfillments.push({
        type: 'DELIVERY',
        deliveryDetails: {
          scheduleType: 'SCHEDULED',
          deliverAt: scheduleTime,
        },
      });
    }
  }

  try {
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: cartItems.map(item => ({
          catalogObjectId: item.variationId,
          quantity: String(item.quantity),
        })),
        ...(fulfillments.length > 0 && { fulfillments }),
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
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
