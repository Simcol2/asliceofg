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

  const { action, email, givenName, familyName } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (action !== 'lookup' && action !== 'register') {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const searchResponse = await client.customers.search({
      query: {
        filter: {
          emailAddress: { exact: email },
        },
      },
    });

    const existing = searchResponse.customers?.[0];

    if (existing) {
      return res.status(200).json({
        customerId: existing.id,
        givenName: existing.givenName,
        familyName: existing.familyName,
        email: existing.emailAddress,
        isNew: false,
      });
    }

    if (action === 'lookup') {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const createResponse = await client.customers.create({
      emailAddress: email,
      givenName: givenName || '',
      familyName: familyName || '',
      idempotencyKey: crypto.randomUUID(),
    });

    const customer = createResponse.customer;
    return res.status(201).json({
      customerId: customer.id,
      givenName: customer.givenName,
      familyName: customer.familyName,
      email: customer.emailAddress,
      isNew: true,
    });

  } catch (error) {
    console.error('Customer error:', error);
    return res.status(500).json({ error: 'Customer operation failed' });
  }
}
