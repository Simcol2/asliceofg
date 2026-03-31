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

  const { cartItems, fulfillmentType, fulfillmentDateTime, orderNote } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  for (const item of cartItems) {
    if (!item.variationId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
  }

  const type = fulfillmentType === 'SHIPMENT' ? 'SHIPMENT' : 'PICKUP';

  // Build fulfillment object — recipient.displayName is required for PICKUP/DELIVERY.
  // For SHIPMENT, Square collects the address on their hosted checkout page.
  let fulfillment;
  if (type === 'SHIPMENT') {
    fulfillment = {
      type: 'SHIPMENT',
      shipmentDetails: {
        recipient: { displayName: 'Customer' },
      },
    };
  } else {
    // PICKUP — use the customer-selected date/time, fall back to tomorrow at noon
    let scheduledAt = fulfillmentDateTime;
    if (!scheduledAt) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(17, 0, 0, 0); // noon EST as UTC fallback
      scheduledAt = tomorrow.toISOString();
    }
    fulfillment = {
      type: 'PICKUP',
      pickupDetails: {
        scheduleType: 'SCHEDULED',
        pickupAt: scheduledAt,
        recipient: { displayName: 'Customer' },
      },
    };
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
        fulfillments: [fulfillment],
        ...(orderNote ? { referenceId: orderNote.slice(0, 40), note: orderNote } : {}),
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
