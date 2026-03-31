const PLACE_ID = 'ChIJB0qBk6Y1K4gRD4D9fiX-dAc';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=reviews,rating,user_ratings_total&reviews_sort=newest&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== 'OK') throw new Error(data.status);

    const reviews = (data.result.reviews || [])
      .filter(rv => rv.rating >= 4)
      .slice(0, 5)
      .map(rv => ({
        author:    rv.author_name,
        avatar:    rv.profile_photo_url,
        rating:    rv.rating,
        text:      rv.text,
        time:      rv.relative_time_description,
      }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      reviews,
      rating:       data.result.rating,
      totalRatings: data.result.user_ratings_total,
    });
  } catch (err) {
    console.error('Reviews error:', err);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}
