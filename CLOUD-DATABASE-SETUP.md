# Optional per-user cloud sync

The tracker works offline and saves progress on the current device. Supabase cloud sync is wired to the project for signed-in users. Each account gets one private database row; Row Level Security limits access to that account, and Realtime sends changes to that user's other signed-in devices.

## What is already configured

- The `jee_tracker_state` table and per-user Row Level Security policies were applied and verified in the Supabase project.
- `js/cloud-config.js` contains the project URL and browser-safe publishable key. Never replace it with a secret/service-role key.
- Supabase Auth's Site URL and only allowed redirect are set to the published GitHub Pages address.

## Start syncing

1. Publish the updated website files from this folder to GitHub Pages over HTTPS. The OneDrive GitHub project folder has the same cloud configuration.
2. Open the published website and choose **Cloud sync**.
3. Create an account or sign in. On first sign-in, choose whether to load that account's cloud copy or upload the data on this device. After that, changes sync automatically across signed-in devices.

## Before inviting other users

Supabase's built-in email sender only delivers to project team addresses and currently has a low sending limit. To let people outside the project team verify sign-up or password-reset emails, configure a custom SMTP provider in Supabase Auth. Keep email confirmation enabled; do not disable it just to bypass email delivery. See [Supabase's custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

Use a unique password. On a shared device, sign out when finished. Supabase Auth holds the account email and password authentication data; the website does not store the password itself.

## Free tier and limits

Supabase currently lists a $0 Free plan with 500 MB database storage and 50,000 monthly active users; free projects may pause after one week of inactivity. Limits and plan terms can change. Check Supabase's [current pricing](https://supabase.com/pricing) before inviting users.

Cloud sync needs internet and the Supabase JavaScript library is loaded from a CDN only when cloud settings are filled in. Offline practice and local backups continue to work without it. If two devices edit at the exact same time, the most recent full tracker save wins.
