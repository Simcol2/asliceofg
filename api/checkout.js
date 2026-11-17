import pkg from 'square';
import crypto from 'crypto';
const { SquareClient, SquareEnvironment } = pkg;

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

// Pickup locations offered in the cart (js/pickup-locations.js shows the same options).
// Each location accepts pickups on `days` (0 = Sunday) between startMinutes and endMinutes,
// in Toronto time, and every pickup needs at least PICKUP_NOTICE_HOURS of notice.
export const PICKUP_NOTICE_HOURS = 24;
export const PICKUP_LOCATIONS = {
  spadina: {
    label: '70 Spadina Road',
    days: [0, 1, 2, 3, 4, 5, 6],
    startMinutes: 12 * 60,
    endMinutes: 19 * 60,
    hoursText: 'every day between 12:00 pm and 7:00 pm',
  },
  woodbine: {
    label: '7270 Woodbine Avenue (Cravins Caribbean Grill)',
    days: [1, 2, 3, 4, 5, 6],
    startMinutes: 12 * 60,
    endMinutes: 17 * 60,
    hoursText: 'Monday to Saturday between 12:00 pm and 5:00 pm',
  },
};

// Returns { location } for a valid choice, or { error } with a customer-facing message.
// A request without a location (a page loaded before the choice existed) is treated as Spadina.
export function resolvePickupLocation(pickupLocation, dateTime, now = Date.now()) {
  const id = pickupLocation == null || pickupLocation === '' ? 'spadina' : pickupLocation;
  const location = Object.prototype.hasOwnProperty.call(PICKUP_LOCATIONS, id)
    ? PICKUP_LOCATIONS[id]
    : null;
  if (!location) return { error: 'Choose a valid pickup location.' };

  const dt = dateTime ? new Date(dateTime) : null;
  if (!dt || isNaN(dt.getTime())) {
    return { error: `Choose a pickup date and time. ${location.label} pickup is available ${location.hoursText}.` };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(dt).map(part => [part.type, part.value])
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (!location.days.includes(day) || minutes < location.startMinutes || minutes > location.endMinutes) {
    return { error: `${location.label} pickup is only available ${location.hoursText}. Please choose another time or the other pickup location.` };
  }
  if (dt.getTime() < now + PICKUP_NOTICE_HOURS * 60 * 60 * 1000) {
    return { error: `Pickups need at least ${PICKUP_NOTICE_HOURS} hours' notice. Please choose a later time.` };
  }
  return { location };
}

function formatFulfillmentLabel(type, dateTime, pickupLabel) {
  if (!dateTime) return type === 'PICKUP' && pickupLabel ? `Pickup at ${pickupLabel}` : null;
  const dt = new Date(dateTime);
  const dateStr = dt.toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Toronto',
  });
  const timeStr = dt.toLocaleTimeString('en-CA', {
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Toronto',
  });
  return type === 'PICKUP'
    ? `Pickup${pickupLabel ? ` at ${pickupLabel}` : ''}: ${dateStr} at ${timeStr}`
    : `Ships by: ${dateStr}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cartItems, fulfillmentType, fulfillmentDateTime, orderNote, pickupLocation } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  for (const item of cartItems) {
    if (!item.variationId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
  }

  const type = fulfillmentType === 'SHIPMENT' ? 'SHIPMENT' : 'PICKUP';

  let pickup = null;
  if (type === 'PICKUP') {
    const resolved = resolvePickupLocation(pickupLocation, fulfillmentDateTime);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    pickup = resolved.location;
  }

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
        ...(pickup ? { note: `Pickup location: ${pickup.label}` } : {}),
      },
    };
  }

  try {
    const fulfillmentLabel = formatFulfillmentLabel(type, fulfillmentDateTime, pickup?.label);

    const lineItems = [
      ...cartItems.map(item => ({
        catalogObjectId: item.variationId,
        quantity: String(item.quantity),
      })),
      ...(fulfillmentLabel ? [{
        name: fulfillmentLabel,
        quantity: '1',
        basePriceMoney: { amount: BigInt(0), currency: 'CAD' },
      }] : []),
    ];

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems,
        fulfillments: [fulfillment],
        ...(orderNote ? { referenceId: orderNote.slice(0, 40), note: orderNote } : {}),
      },
      checkoutOptions: {
        redirectUrl: 'https://asliceofg.com/confirmation.html',
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
