import pkg from 'square';
const { Client, Environment } = pkg;
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

  const { action, email, givenName, familyName } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (action !== 'lookup' && action !== 'register') {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const { result: searchResult } = await client.customersApi.searchCustomers({
      query: {
        filter: {
          emailAddress: { exact: email },
        },
      },
    });

    const existing = searchResult.customers?.[0];

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

    const { result: createResult } = await client.customersApi.createCustomer({
      emailAddress: email,
      givenName: givenName || '',
      familyName: familyName || '',
      idempotencyKey: crypto.randomUUID(),
    });

    const customer = createResult.customer;
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
