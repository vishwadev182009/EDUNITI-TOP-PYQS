# Security review

Review date: 25 November 2026

## Findings and fixes prepared

- **Imported backup data could contain unsafe values.** Imports now stop at 4 MB and pass through a strict normalizer. It allows only known challenge IDs, caps question counts and text sizes, validates response/status values, and accepts only local raster question images and HTTPS YouTube links.
- **Unbounded question totals could exhaust the browser.** User-entered totals and imported values are capped at 5,000 per challenge. Malformed question state is discarded or normalized before rendering and syncing.
- **A shared browser could mix two accounts’ data.** The device remembers the account associated with its local tracker. Upload is hidden for a different account until the user loads that account’s cloud save or confirms clearing the device copy.
- **Cloud snapshots were trusted on receipt.** Remote snapshots are normalized before storage or display. Realtime events are checked against the signed-in user, and stale account events are ignored.
- **The cloud client dependency floated on a moving version.** Supabase JS is pinned to 2.119.2. The exact release is listed in the [official Supabase JS releases](https://github.com/supabase/supabase-js/releases).
- **The site lacked a browser content policy.** A Content Security Policy now limits scripts to the site and pinned CDN host, connections to the configured Supabase project, and blocks object embedding and form submissions to other sites.
- **CSV exports could trigger spreadsheet formulas.** Formula-leading cells are prefixed before CSV quoting.
- **Cloud rows had no size/type limit.** The SQL setup script now includes a 4 MB JSON object constraint. It is `NOT VALID` so existing rows are not scanned during installation; new and updated rows must satisfy it.

## Database access review

The SQL grants access only to authenticated users for `SELECT`, `INSERT`, and `UPDATE`; it revokes table access from `anon`. Row Level Security is enabled, and each policy compares `user_id` with `auth.uid()`. There is no delete grant or public policy. The browser configuration contains the public Supabase publishable key; it must never contain a service-role or secret key.

The table and RLS policies were reported as applied and verified earlier. **The new size constraint has not yet been applied to the live Supabase database.** Run the updated `supabase-schema.sql` in the Supabase SQL Editor to add it. The script re-creates the same per-user policies and adds the constraint idempotently.

## Remaining limits

- This was a source/configuration review, not a full penetration test or an independent audit of Supabase’s hosting environment.
- The site stores local progress in the browser and cloud snapshots as ordinary JSON in Supabase. Cloud transfers use HTTPS; there is no end-to-end encryption. Anyone who can use an already signed-in browser profile may see that profile’s data.
- Supabase Auth stores account email addresses. Use a unique password, sign out on shared devices, and do not share passwords or login codes.
- The Supabase project’s email verification, password recovery, rate limits, backups, and account protections remain controlled by its dashboard settings.
- The size constraint is prepared but remains pending until the SQL is applied. The hardened app files are also prepared locally and have not been published as part of this review.
