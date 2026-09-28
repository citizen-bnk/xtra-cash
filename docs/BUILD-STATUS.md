# XTRA-CASH — MVP build status (26 Sep 2026)

## ▶ NEXT SESSION: do this first
1. **Vercel is working again** (account block cleared 28 Sep). `main` deploys web, admin and api automatically; PRs get preview deployments.
2. The `xtra-cash-api` Vercel project is left over from the superseded serverless-API approach. The API runs on Render, so disconnect or delete that project.
3. **Brand follow-ups:** replace the fire video with a clean export without the Veo mark when available; add the Mastercard logo only after an issuing agreement; ask the designer for a flat, front-on blank card design if the drawn card should be replaced with artwork. Messaging rules are in `docs/MESSAGING.md`.
4. This file (`docs/BUILD-STATUS.md`) is the build status; keep it updated in the repo. Always start sessions with `citizen-bnk/xtra-cash` attached as a source. Commit and push every change; no more zips or bundles.
5. On Render, check the `xtra-cash-api` service has `ENABLE_DEMO_LOGIN=true` (added to render.yaml on 28 Sep; add it by hand under **Environment** if the Blueprint didn't sync it). Switch it to `false` before real customers sign up.

## Done 28 Sep 2026 (commit `2d1e178`, pushed straight to `main`)
- **One-click demo sign-in.** The web and back-office sign-in pages show a "Try a demo" panel: shoppers (salaried, gig worker, student, KYC pending), micro-lenders (accredited, assisted, awaiting review), affiliate, super-admin and operations admin. Each tile is a role description; one click signs in, no password.
  - API: `GET /auth/demo`, `POST /auth/demo/login` (apps/api/src/auth/demo.service.ts). Off unless `ENABLE_DEMO_LOGIN=true`.
  - On an empty database (the live site) the first click builds the demo world once through the real services (about 5 s). Demo staff are `demo.superadmin@xtracash.co.za` / `demo.ops@xtracash.co.za`; in production a tile never resolves to the local-seed staff addresses, so it can't sign in as the real super-admin.
  - The demo world lives in apps/api/src/db/demo-data.ts; `pnpm db:seed` uses it and behaves as before.
- **Responsive fixes**, checked with screenshots at 390 / 820 / 1440 px on 15 pages (no sideways scroll anywhere): landing header stays on one line and the hero glow no longer overflows on phones; receipt sits above the card; buttons and logo never wrap; tables keep cells on one line and scroll inside their card (free-text columns still wrap); shopper home repayment amounts no longer collide with dates; modals scroll.
- Moved the uploaded `brand/fire.mp4` to `apps/web/public/brand/fire.mp4`, where the landing hero plays it. (Since replaced by an optimised version: bars cropped, no audio, WebM 1.2 MB + MP4 1.9 MB; the original stays in `brand/fire.mp4`.)
- Verified before pushing: typecheck (all 6 packages), 24 API tests, web and admin `next build`.

## Done 26 Sep 2026
- Brand refresh published: commit `98cffc5` went through https://github.com/citizen-bnk/xtra-cash/pull/4 and merged to `main` as `612d217`. Before pushing, `pnpm install --frozen-lockfile`, the web and admin `next build` and mobile `tsc` all passed.
- The project docs `claude/brand-refresh.bundle.b64.txt` and `claude/vercel-deploy.patch` are obsolete; delete them.

## Why pushing failed before
The Claude session that built most of this was started **without** the GitHub repo attached as a source. The git proxy only lets a session write to repositories attached to that session, even with a personal token (tested: a token is refused too). Connecting a GitHub account isn't enough; the repo has to be picked as a source when the task is created. The session that made branch `claude/jolly-thompson-3hfli2` (PRs #1–#3) had it attached and could push.

## Current state
- **Hosting:** the API runs on **Render** (render.yaml). Web and admin run on **Vercel** and proxy `/api/*` to the API server-side (`API_URL` env var; packages/ui/src/api-proxy.ts). `main` is at `612d217` (PRs #1–#4 merged).
- The earlier "Vercel serverless API" approach (`claude/vercel-deploy.patch`) is **superseded**. Don't apply it.
- **Brand refresh** (live on `main`, PR #4): the burning-wallet logo (mark + gradient wordmark) in web, admin and mobile; favicons and Apple icons; Expo icon, adaptive icon and splash; theme tokens on the brand palette (ink #1b1030, brand #D91F63, purple #A617D3, violet #5C2394, orange #FB9320); gradient card; brand glow on the balance hero; originals in `brand/`.
- Brand assets and the original prototype's design notes: `claude/xtra-cash-brand-and-design.md`.

## Stack (TypeScript monorepo, pnpm)
- apps/api — NestJS 11 + Drizzle ORM + PostgreSQL 16. Swagger at /docs.
- apps/web — Next.js 15: shopper (/app), lender Credit Mall (/lender), affiliate (/affiliate)
- apps/admin — Next.js 15 back office (super-admin / admin)
- apps/mobile — Expo SDK 54 shopper app
- packages/shared — types, enums, loan maths, SA ID validation, typed API client
- packages/ui — shared React components, brand tokens (theme.css), API proxy

## Built (phase 1)
- Consumer: register, KYC, XTRA-Balance = wallet + matched credit, virtual card, pay, freeze, repay, arrears
- Credit engine: lender criteria matching, affordability cap, cheapest-offer-first allocation, idempotent point-of-payment authorisation, HMAC-signed JIT card-network webhook
- Credit Mall: accreditation (standard/assisted paid), documents, EFT load/withdraw, offers + criteria + reach preview, loan book
- Affiliates: referral links, commissions, admin approval, payouts
- Back office: dashboard, users, KYC, lenders, funding, offers, loans, transactions, affiliates, settings, audit log, ledger check
- Double-entry ledger; 24 passing tests (unit + e2e)

## Demo logins (local seed; on the live site use the "Try a demo" tiles)
superadmin@xtracash.co.za / Admin@12345; naledi@example.com, lindiwe@kasicapital.co.za, thabo.affiliate@example.com / Passw0rd!

## Defaults to confirm with compliance
Max 5%/month interest, R69 service fee cap, 30% affordability ratio, 5% platform share, R2 500 assisted accreditation fee — editable in back-office settings.

## Mocked integrations (apps/api/src/integrations)
Credit bureau, card issuer/processor, pay-in gateway, identity verification. Still to add: OTP/SMS, notifications, DebiCheck, disclosure docs.

## Phase 2 (not built)
Marketplace + merchant stores, delivery drivers, e-bike lease/buy (XTRA-INCOME™). The existing prototype's screens (see the brand/design doc) are the reference.
