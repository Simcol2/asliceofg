# Past Events

Adapted from the supplied `asliceofg-past-events` pack for this repository's static HTML site. No Next.js runtime or new dependencies are required.

- `/past-events` serves `index.html`.
- `/past-events/thanksgiving-gathering` serves `thanksgiving-gathering.html`.
- Styling lives in `/css/past-events.css`.
- Both routes are configured in the root `vercel.json`.

The cover and gallery use the existing public Supabase bucket `Photos from`: `thanksgiving4.png` (table), `thanksgiving3.png` (desserts), and `centerpiece.png` (florals). Gallery links open the original photos. No storage permissions or database records were changed.

To add another event, create another static detail page, add its card to `index.html`, add an explicit rewrite in `vercel.json`, and list the new URL in `sitemap.xml`. The pack's unpublished Oscars draft has not been published.
