const PLACE_ID = 'ChIJB0qBk6Y1K4gRD4D9fiX-dAc';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  try {
    const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
    const r = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
      },
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('Google Places (New) error:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'Places API error' });
    }

    const reviews = (data.reviews || [])
      .filter(rv => rv.rating >= 4)
      .slice(0, 5)
      .map(rv => ({
        author: rv.authorAttribution?.displayName || 'Guest',
        avatar: rv.authorAttribution?.photoUri || null,
        rating: rv.rating,
        text:   rv.text?.text || rv.originalText?.text || '',
        time:   rv.relativePublishTimeDescription || '',
      }))
      .filter(rv => rv.text);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      reviews,
      rating:       data.rating,
      totalRatings: data.userRatingCount,
    });

  } catch (err) {
    console.error('Reviews error:', err);
    return res.status(500).json({ error: err.message });
  }
}
