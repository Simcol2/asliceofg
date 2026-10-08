// A Slice of G Events storefront: Supabase is the source of rental inventory.
// Square is used later by the existing /rentals checkout to collect payment.
const EVENT_ITEM_IDS = [600, 604, 605, 606, 607];
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.EVENTS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.EVENTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVENTS_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Rental inventory connection is not configured' });
  try {
    const endpoint = `${url.replace(/\/$/, '')}/rest/v1/items?select=id,name,description,rental_price,photos,active,quantity_owned&active=eq.true&id=in.(${EVENT_ITEM_IDS.join(',')})`;
    const result = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` }});
    if (!result.ok) throw new Error(`Supabase inventory HTTP ${result.status}`);
    const rows = await result.json();
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    const products = EVENT_ITEM_IDS.filter(id => byId.has(id)).map(id => {
      const item = byId.get(id);
      const price = Number(item.rental_price);
      return {
        rentalId: id,
        name: item.name,
        description: item.description || '',
        imageUrl: Array.isArray(item.photos) && typeof item.photos[0] === 'string' ? item.photos[0] : null,
        priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
        bookable: Number.isFinite(price) && price > 0 && Number(item.quantity_owned) > 0,
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ products });
  } catch (error) {
    console.error('Supabase Events inventory failed:', error);
    return res.status(502).json({ error: 'Event rentals are temporarily unavailable' });
  }
}
