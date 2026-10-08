// Cake storefront adapter. Square selects visible products; Events Supabase inventory
// supplies authoritative rental IDs/prices. Never permit ambiguous catalog mapping.
const normalize = (v) => String(v || '').trim().toLocaleLowerCase('en-CA').replace(/\s+/g, ' ');
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const base = `https://${req.headers.host}`;
  try {
    const [catResp, categoryResp] = await Promise.all([
      fetch(`${base}/api/catalog`), fetch(`${base}/api/categories`),
    ]);
    if (!catResp.ok || !categoryResp.ok) throw new Error('Square catalog unavailable');
    const [{items}, {categories}] = await Promise.all([catResp.json(), categoryResp.json()]);
    const eventIds = new Set((categories || []).filter(c => normalize(c.name) === 'events').map(c => c.id));
    if (!eventIds.size) throw new Error('Square Events category not found');
    const visible = (items || []).filter(i => (i.categoryIds || []).some(id => eventIds.has(id)));
    const url = process.env.EVENTS_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.EVENTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(503).json({ error: 'Rental inventory connection not configured' });
    const rentalsResp = await fetch(`${url.replace(/\/$/, '')}/rest/v1/items?select=id,name,rental_price,active&active=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!rentalsResp.ok) throw new Error('Events rental inventory unavailable');
    const rentals = await rentalsResp.json();
    const lookup = new Map();
    rentals.forEach(row => {
      const name = normalize(row.name);
      lookup.set(name, [...(lookup.get(name) || []), row]);
    });
    const products = visible.map(item => {
      const matches = lookup.get(normalize(item.name)) || [];
      const match = matches.length === 1 ? matches[0] : null;
      const variations = item.variations || [];
      const priceCents = match ? Math.round(Number(match.rental_price) * 100) : null;
      const priceMatches = variations.length === 1 && priceCents > 0 && Number(variations[0].priceCents) === priceCents;
      return {
        squareItemId: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        priceCents: variations.length === 1 ? Number(variations[0].priceCents) : null,
        rentalId: match && priceMatches ? Number(match.id) : null,
        bookable: Boolean(match && priceMatches),
        reason: !match ? 'Not mapped to a unique rental inventory item' : !priceMatches ? 'Square variation/price does not match the Events rental system' : null,
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ products });
  } catch (e) {
    console.error('Events catalog adapter:', e);
    return res.status(502).json({ error: 'Unable to load event rentals' });
  }
}
