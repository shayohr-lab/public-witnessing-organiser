# Public Witnessing Organizer

A phone-friendly web app for one congregation to book 2-hour public witnessing cart sessions, invite companions, and let the Service Overseer keep an eye on coverage.

- **Front end:** React + TypeScript + Tailwind (Vite)
- **Back end:** Supabase (database, sign-in, security rules)
- **Hosting:** any free static host (Vercel, Netlify, Cloudflare Pages)

All booking rules live in the database (`supabase/migrations/…_pwo_schema_v1.sql`), so nobody can get around them from the app:
- 3 per slot, Monday to Saturday.
- Invitations need 2 days' notice.
- If someone is left alone, they and the Service Overseer are alerted.
- A lone booking is released 1 hour before the start.

## 1. Database (once)

1. Create a free project at supabase.com.
2. In **SQL Editor**, run `supabase/migrations/20261021000000_pwo_schema_v1.sql`. Change `[Your congregation name]` first.
3. Under **Database → Extensions**, enable **pg_cron**, then run:
   ```sql
   select cron.schedule('release-unpaired', '*/10 * * * *', $$select public.release_unpaired()$$);
   ```
4. Under **Authentication → Providers → Email**, turn **Confirm email** off.

## 2. Put the app online (Vercel, free)

1. Sign in at vercel.com with your GitHub account.
2. Click **Add New → Project** and import this repository.
3. Under **Environment Variables**, add both values from Supabase → Project Settings → API:
   - `VITE_SUPABASE_URL`, the Project URL
   - `VITE_SUPABASE_ANON_KEY`, the anon / publishable key (never the service_role key)
4. Click **Deploy**. Your app is live at `https://<name>.vercel.app`. Every push to `main` redeploys it.

### Or: GitHub Pages (no extra account)

1. Put the two Supabase values in a file named `.env.production` in this repository:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
   ```
2. In GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every push to `main` publishes the app at `https://shayohr-lab.github.io/public-witnessing-organiser/` (see the **Actions** tab for progress).

Netlify works the same way: build command `npm run build`, publish directory `dist`, and the same two variables.

## 3. Make yourself the first Service Overseer

1. Register in the app with your own phone number.
2. In Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'overseer', status = 'approved' where phone = '+2557XXXXXXXX';
   ```
3. Tap **Check again** in the app. The shield button opens the **Service Overseer console**.

## 4. Password resets (optional, recommended)

In Supabase, go to **Edge Functions → Deploy a new function**. Name it `admin-reset-password` and paste `supabase/functions/admin-reset-password/index.ts`. The Service Overseer can then use **Publishers → Reset password** to give a member a temporary password.

## Updating to v1.1 (review of 22/10/26)

1. In Supabase **SQL Editor**, run `supabase/migrations/20261022000000_pwo_update_v1_1.sql` (keeps all data, safe to run again).
2. Deploy the `admin-reset-password` Edge Function (section 4) if you haven't yet.
3. Then publish this version of the app.

What v1.1 adds: access levels (Super Admin / MT Assistant / Publisher) and service types (publisher, auxiliary, regular, full-time pioneer); booking for a day closes at 4:30 AM that morning (joining someone who is alone stays open); a companion can be invited once a week (pioneers have no limit); names on every slot, tap a name to see their bookings this month; "Booked at …" on other locations; "Book the next session too?"; invitations shown on the schedule; notice board as titles only; pre-registering publishers with a WhatsApp link; grouped "Needs a companion" messages; delete locations and add/delete time slots.

## Run locally

```sh
npm install
cp .env.example .env.local   # fill in the two values
npm run dev
```

## Planned for later
- SMS and automatic WhatsApp
- Push notifications
- Kiswahili
- More congregations (the database already supports this)
