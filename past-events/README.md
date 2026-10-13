# Past Events

Adapted from the supplied `asliceofg-past-events` pack for this repository's static HTML site. No Next.js runtime or new dependencies are required.

- `/past-events` serves `index.html`.
- `/past-events/thanksgiving-gathering` serves `thanksgiving-gathering.html`.
- Styling lives in `/css/past-events.css`.
- Both routes are configured in the root `vercel.json`.

The cover and gallery use the existing public Supabase bucket `Photos from`: `thanksgiving4.png` (table), `thanksgiving3.png` (desserts), `centerpiece.png` (florals), and `thanskgivingarches.png` (arches; filename as stored in Supabase). Gallery links open the original photos. No storage permissions or database records were changed.

To add another event, create another static detail page, add its card to `index.html`, add an explicit rewrite in `vercel.json`, and list the new URL in `sitemap.xml`. The Oscars page is published at `/past-events/night-at-the-oscars` using `oscarshero.jpg`, `oscars1.png`, `oscars2.jpg`, and `oscars3.png` from the same public Supabase bucket.

The Oscars gallery also includes `oscars6.jpeg`. The four files named `oscarssmall.jpeg`, `oscarssmall2.jpeg`, `oscarssmall4.jpeg`, and `oscarssmall5.jpeg` appear together in a compact two-column, two-row grid on desktop and mobile. The Thanksgiving table cover is shown only once on its detail page; the gallery contains the other three photos.
