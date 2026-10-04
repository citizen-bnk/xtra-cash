# Deploying XTRA-CASH on Vercel

Everything runs on **Vercel**, as three projects built from this one repository. Every push to `main` redeploys all three to production; pull requests get preview deployments.

| Vercel project | Root Directory | What it is |
|---|---|---|
| `xtra-cash-api` | `apps/api` | NestJS API, running as serverless functions. Swagger docs at `/docs` |
| `xtra-cash-web` | `apps/web` | Shopper, lender (Credit Mall) and affiliate portals |
| `xtra-cash-admin` | `apps/admin` | Back office |

The browser never calls the API directly. The web and admin sites forward `/api/*` to the API from their own server (`API_URL`), so there is no CORS to configure.

## 1. Database

The API needs PostgreSQL. On the `xtra-cash-api` project, open **Storage → Create Database** and pick Postgres (Neon). Vercel adds `DATABASE_URL` to the project for you. Any other managed Postgres works too; set `DATABASE_URL` yourself.

Pick a region close to the API's functions (Frankfurt, `fra1`, is closest to South Africa).

## 2. Environment variables

Set these under each project's **Settings → Environment Variables** (Production, and Preview if you use preview deployments). Changing a variable needs a redeploy (**Deployments → … → Redeploy**).

**xtra-cash-api**

| Key | Value |
|---|---|
| `DATABASE_URL` or `XTR_DATABASE_URL` | your Postgres connection string; the API also accepts the `XTR_` prefix used by the existing Neon integration |
| `JWT_SECRET` | a random string, **at least 32 characters** |
| `CARD_NETWORK_SECRET` | a random string (signs card-processor webhooks) |
| `CRON_SECRET` | a random string. Vercel Cron sends it to `/jobs/arrears` each night |
| `NODE_ENV` | `production` |
| `ENABLE_SIMULATION` | `true` while no card processor is connected (allows "simulate purchase" and mock top-ups). `false` before real money moves |
| `ENABLE_DEMO_LOGIN` | optional. Demo sign-in tiles are **on** unless this is `false`. Set `false` before real customers sign up: the demo staff tiles open the back office |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your first super-admin (password 12+ characters). Created once by the production build |
| `PUBLIC_URL` | the API's own URL, e.g. `https://xtra-cash-api.vercel.app` |
| `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS` | optional, default `15m` and `30` |

**xtra-cash-web**

| Key | Value |
|---|---|
| `API_URL` | the API's URL, e.g. `https://xtra-cash-api.vercel.app` (no trailing slash) |
| `NEXT_PUBLIC_ADMIN_URL` | the back office's URL (used for the "staff" link on the sign-in page) |

**xtra-cash-admin**

| Key | Value |
|---|---|
| `API_URL` | the API's URL |

## 3. What happens on each deploy

- **API production build** (`apps/api/vercel.json` → `pnpm run vercel-build`): compiles the API, applies database migrations, and creates the super-admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if it doesn't exist yet. Preview builds skip the database steps, so a pull request never changes the live schema. If migrations fail, the deploy fails and the previous version stays live.
  A missing database URL or a JWT secret shorter than 32 characters also fails the production build, so a successful build cannot silently skip the database release.
- **Nightly arrears check:** Vercel Cron calls `GET /jobs/arrears` at 01:05 South African time (23:05 UTC), authorised with `CRON_SECRET`. The back office's "Run arrears check" button does the same on demand.
- **Uploaded documents** (lender accreditation) are stored in the database, because serverless functions have no shared disk. Uploads are limited to 4 MB (Vercel's request limit is 4.5 MB).

## 4. Check it works

- `<API_URL>/health` returns `{"status":"ok",...}` (this also proves the database connection)
- `<API_URL>/auth/demo` lists the demo roles (`"enabled": true`)
- `<API_URL>/docs` shows the API docs
- The web sign-in page shows **Try a demo**. The first demo click builds the sample accounts and data (a few seconds), then signs you in
- Sign in to the back office with `ADMIN_EMAIL` / `ADMIN_PASSWORD`

**If sign-in says "The XTRA-CASH API at … is not responding":** the message names the address the site tried. Fix `API_URL` on the web or admin project and redeploy it. If the address is right, open `…/health` on it and check the API project's **Logs**.

## 5. Before real customers

- Set `ENABLE_DEMO_LOGIN=false` and `ENABLE_SIMULATION=false` on the API, then redeploy.
- A compliance officer confirms the regulatory caps and fees under Back office → Settings.
- `pnpm db:seed` (local demo data) refuses to run when `NODE_ENV=production`.

## Mobile app

Not hosted on Vercel. Build it with Expo EAS and set `EXPO_PUBLIC_API_URL` to the API's URL.
