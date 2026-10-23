# Nearby offers and reusable loan selections

Loan amount and term controls share components across public entry, chat and form. They use the existing integer-cent and whole-month validation. Public selections save before the identity step and transfer to the encrypted account draft before the saved-details summary. A newer account draft takes precedence over an older browser handoff. Switching form/chat never resets answers; applicants still confirm current finances and consent.

Lenders can choose an OpenStreetMap pin or current GPS location, name the area and set a 50–5,000 metre radius in 50 metre increments. The offer assistant can suggest an area name/radius but cannot invent coordinates. The lender confirms the map pin. Place search/nearby venue lists are prepared for Google's Places API (New), enabled only when `GOOGLE_MAPS_API_KEY` is supplied on the API project. Without a key, map pin and GPS remain usable; search reports that it is disconnected.

Campaigns reference an owned offer and snapshot its target. Drafts require explicit activation, an accredited lender, an active offer and valid dates. Location is advertising-only: credit engine rules, application eligibility and affordability are unchanged. Public share links hide lender identities, carry no personal information and never transfer eligibility.

Members opt into marketing and location separately. Only verified profiles meeting the offer's existing criteria are matched; absent bureau scores are not invented. Only the latest reading is stored, encrypted. It expires after 24 hours and the protected 15-minute cleanup job removes expired readings. Withdrawal clears it immediately. Lenders receive aggregate counts, never member GPS or audience lists. Location is not used in risk scoring.

The server uses the GPS accuracy estimate conservatively: distance from centre plus reported accuracy must fit entirely inside the radius. Readings older than five minutes or unreasonably in the future are rejected. Older readings cannot overwrite newer ones. GPS can be spoofed; it does not establish identity, affordability or transaction authorisation.

Push requires an opted-in device. Every member is capped at one attempt per offer per South African calendar day, and two marketing attempts total per day. Row locking and unique keys prevent concurrent duplicate reservations. Quiet hours are 20:00–08:00 South African time. Uncertain/failed sends are not automatically replayed. No alerts are queued for after quiet hours, when the member may have left.

Web Push uses `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Subscription secrets are encrypted; endpoint hosts are restricted to supported browser push services to prevent SSRF. Web Push acceptance does not mean a person saw the notification. The service worker uses a neutral message and opens only same-origin campaign paths.

Native Expo integration requires `ENABLE_EXPO_PUSH=true` on the API, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` and an EAS project ID in the mobile build. APNs/FCM credentials must be connected to that EAS project. `EXPO_ACCESS_TOKEN` is supported when Expo push access-token security is enabled. Native receipts are checked by `/jobs/marketing`; stale devices are disabled. Provider receipts and member opens are distinct measurements.

PWA location observation runs only while the app is visible, and only after previously granted permission. It cannot detect background arrival. Native arrival alerts require a new development/store build with the location/notification plugins and background location consent; a Vercel deployment cannot update an installed native binary. The native app registers the nearest 20 active campaign regions, refreshes on app activation and validates a fresh GPS fix when a region is entered. New or distant campaign areas may require reopening the app to refresh regions. OS termination, permissions, battery restrictions and GPS accuracy affect detection. The native application entry opens the web application with amount/term preserved; it does not introduce a second native lending decision flow.

The scheduled job authenticates with `CRON_SECRET`. No production demo campaigns, members' locations or marketing sends are created during release verification. Provider dispatch is exercised only with isolated fixtures.

## Native release connection

The installable PWA is available without an Expo or app-store account at `/install`. This delivers an installed home-screen app now, while retaining the documented foreground-only location behavior. The native project is owned by `xtra-cash-team`.

The Expo CLI on the release machine is not signed in. From `apps/mobile`, the account owner must sign in with `npx eas-cli@latest login` and configure APNs/FCM credentials with `npx eas-cli@latest credentials`. The project ID is already set in `app.json`; do not initialize a second project. Never put an Expo access token, APNs key or service-account JSON into source control. Build profiles are provided in `eas.json`; a device build is required to verify permission denial, background entry and push receipts. Store submission additionally requires the account owner's Apple/Google developer access. Use `npx eas-cli@latest build --platform android --profile preview` for an internally distributed Android APK, and the production profile for store binaries.

Expo project connected in source: `@xtra-cash-team/xtra-cash-fintech`, project ID `417255b5-4f68-4dc1-8614-7f1ac5ddd8fc`, supplied by the account owner. Local CLI authentication and signing credentials are still required before a native build can be submitted.
