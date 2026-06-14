# Deploying Furnza (Vercel + Supabase Cloud)

Furnza needs a **hosted** Supabase project — the local Docker stack (`supabase start`)
only exists on your machine, so a Vercel deployment pointed at `127.0.0.1:54321`
will fail with `ECONNREFUSED` / "Internal Server Error". These are the steps to
stand up the cloud backend and connect Vercel to it.

## 1. Create & populate the cloud Supabase project

```bash
# One-time auth (opens a browser)
npx supabase login

# Create the project (pick the region closest to your users)
npx supabase projects create furnza --org-id <ORG_ID> --region ap-southeast-1 --db-password "<STRONG_DB_PASSWORD>"

# Link this repo to it and push the schema (all migrations in supabase/migrations/)
npx supabase link --project-ref <PROJECT_REF> --password "<STRONG_DB_PASSWORD>"
npx supabase db push --password "<STRONG_DB_PASSWORD>" --include-all
```

Save the **DB password** — it is not recoverable, only resettable (Supabase
Dashboard → Project Settings → Database).

### Seed the admin user + demo data

The seed script reads a dotenv file. Create a temporary `.env.seed.local`
(matched by `.gitignore`'s `.env*.local`) pointing at the **cloud** project, run
the seed, then delete it:

```
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SEED_ADMIN_EMAIL=admin@furnza.local
SEED_ADMIN_PASSWORD=<choose-a-strong-password>
SEED_ADMIN_NAME=Admin
```

```bash
npx tsx --env-file=.env.seed.local scripts/seed.ts
rm .env.seed.local   # contains the service-role secret
```

## 2. Get the API keys

```bash
npx supabase projects api-keys --project-ref <PROJECT_REF>
```

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the `sb_publishable_…` (or legacy `anon` JWT)
- `SUPABASE_SERVICE_ROLE_KEY` → the `sb_secret_…` (revealed in the Dashboard) or
  the legacy `service_role` JWT. **Server-only — never prefix with `NEXT_PUBLIC`.**

## 3. Vercel environment variables

Project → Settings → Environment Variables (set for **Production** and **Preview**):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret/service-role key |
| `NEXT_PUBLIC_APP_URL` | your `https://<app>.vercel.app` URL |
| `CRON_SECRET` | a long random string |

Optional: `ANTHROPIC_API_KEY` (powers the "Ask Furnza" dashboard chat box; the box
shows a "not configured" notice when absent). Marketing providers default to a
console adapter, so Resend/Twilio keys are not required.

Env-var changes do **not** apply to existing builds — trigger a **Redeploy** after
adding them.

## 4. Background jobs (`/api/cron`)

`vercel.json` registers a daily Cron Job hitting `/api/cron`. Vercel automatically
sends `Authorization: Bearer $CRON_SECRET`, which the route verifies.

The runner is designed to tick **every minute** (print countdowns, the chat
scheduler, campaign batches, aging alerts). Vercel's **Hobby** plan limits crons to
**once per day**, so on Hobby those features update only daily. For per-minute
cadence either:

- upgrade to **Pro** and change the schedule in `vercel.json` to `* * * * *`, or
- use a free external scheduler (e.g. cron-job.org) hitting
  `POST https://<app>/api/cron` every minute with header
  `Authorization: Bearer <CRON_SECRET>`.

## 5. After first successful deploy

- **Change the admin password** — `ChangeMe!2026` is a public default once the app
  is internet-facing. Update it in the app (Users) or re-seed with your own
  `SEED_ADMIN_PASSWORD`.
- Sign in at `/login` with `admin@furnza.local`.
