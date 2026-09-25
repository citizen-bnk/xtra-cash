# Deploying XTRA-CASH to Render

`render.yaml` describes the whole platform. Render creates it from that one file:

| Render service | What it is | URL (if the names are free) |
|---|---|---|
| `xtra-cash-db` | PostgreSQL 16 | internal only |
| `xtra-cash-api` | NestJS API. It runs migrations and creates the first super-admin on start | `https://xtra-cash-api.onrender.com` |
| `xtra-cash-web` | Shopper, lender and affiliate portals | `https://xtra-cash-web.onrender.com` |
| `xtra-cash-admin` | Back office | `https://xtra-cash-admin.onrender.com` |

Everything is in the Frankfurt region, which is the closest Render region to South Africa, and on the free plan.

## 1. Create the Blueprint

1. Sign in at <https://dashboard.render.com> and connect your GitHub account when asked.
2. Click **New → Blueprint**, pick `citizen-bnk/xtra-cash`, and choose the branch you want to deploy.
3. Render reads `render.yaml` and asks for the values marked `sync: false`. Enter them as below. Replace the URLs if Render gives your services different names; you'll see the names on the next screen.

| Service | Key | Value |
|---|---|---|
| xtra-cash-api | `CORS_ORIGINS` | `https://xtra-cash-web.onrender.com,https://xtra-cash-admin.onrender.com` |
| xtra-cash-api | `PUBLIC_URL` | `https://xtra-cash-api.onrender.com` |
| xtra-cash-api | `ADMIN_EMAIL` | the email you will sign in to the back office with |
| xtra-cash-api | `ADMIN_PASSWORD` | a strong password, **at least 12 characters** |
| xtra-cash-web | `NEXT_PUBLIC_API_URL` | `https://xtra-cash-api.onrender.com` |
| xtra-cash-web | `NEXT_PUBLIC_ADMIN_URL` | `https://xtra-cash-admin.onrender.com` |
| xtra-cash-admin | `NEXT_PUBLIC_API_URL` | `https://xtra-cash-api.onrender.com` |

4. Click **Apply**. The first build takes about 5 to 10 minutes. `JWT_SECRET` and `CARD_NETWORK_SECRET` are generated for you.

## 2. Check it works

- `https://xtra-cash-api.onrender.com/health` returns `{"status":"ok",...}`
- `https://xtra-cash-api.onrender.com/docs` shows the API docs
- Sign in to the admin site with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Register a shopper on the web site

**If the URLs differ from the ones you entered:** fix the values under each service's **Environment** tab. Then redeploy **web** and **admin** (Manual Deploy → Deploy latest commit), because `NEXT_PUBLIC_*` values are built into those sites at build time.

## 3. Things to know

- **Free plan limits.** Free web services sleep after about 15 minutes idle, so the first request after that takes around a minute. The free Postgres database **expires after 30 days**. Upgrade the database, and ideally the API, to a paid plan before any real users sign up.
- **Demo mode is on.** `ENABLE_SIMULATION=true` turns on "simulate purchase" and mock top-ups, because no card processor is connected yet. Set it to `false` before any real money moves.
- **No demo data.** `pnpm db:seed` refuses to run when `NODE_ENV=production`, so the database starts empty apart from your super-admin. Before go-live, a compliance officer must confirm the regulatory caps and fees under Back office → Settings.
- **Auto-deploy.** Every push to the branch you chose redeploys the affected services. Migrations run automatically on each API start.
- **Mobile app.** It isn't hosted on Render. Build it with Expo EAS and set `EXPO_PUBLIC_API_URL=https://xtra-cash-api.onrender.com`.
