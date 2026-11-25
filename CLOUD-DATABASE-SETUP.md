# Optional per-user cloud sync

The tracker continues to work offline and stores progress on the current device. Cloud sync is optional. When configured, each account gets one private database row containing that account's tracker data. Supabase Auth identifies accounts, PostgreSQL Row Level Security limits each account to its own row, and Realtime sends changes to the user's other signed-in devices.

## Set up the free Supabase project

1. Create a Supabase project in your own account. If the provider requires an adult account, ask a parent or guardian to help.
2. In Supabase SQL Editor, run the contents of `supabase-schema.sql`.
3. In the project API settings, copy the **Project URL** and the **publishable key** (or legacy `anon` key).
4. Put those two values in `js/cloud-config.js` as `url` and `anonKey`. Never use a `service_role` or secret key in website code.
5. Set the Supabase Auth Site URL and allowed redirect URL to the exact HTTPS URL where this site is published. Deploy the folder over HTTPS (GitHub Pages works), open the site, choose **Cloud sync**, and create an account. Email confirmation may need to be enabled/verified in Supabase Auth settings.
6. For the first sync, choose whether to load the account's cloud copy or upload this device's data. After that, saves sync automatically and changes from other signed-in devices arrive live.

Use a unique password. On a shared device, sign out when finished. Do not put private data in the tracker. A password reset uses the email address held by Supabase Auth.

## Free tier and limits

Supabase currently lists a $0 Free plan with 500 MB database storage and 50,000 monthly active users; free projects may pause after one week of inactivity. Limits and plan terms can change. This app does not include a paid upgrade or guarantee uninterrupted availability. Check Supabase's [current pricing](https://supabase.com/pricing) before inviting users.

Cloud sync needs internet and the Supabase JavaScript library is loaded from a CDN only when cloud settings are filled in. Offline practice and local backups continue to work without it. If two devices edit at the exact same time, the most recent full tracker save wins.