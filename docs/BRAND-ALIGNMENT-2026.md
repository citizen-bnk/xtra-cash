# Brand alignment — 19 October 2026

The website and back office follow the [XTRA-CASH Brand Guide 2026](https://drive.google.com/file/d/1t7tjiRREBYueDdNHJBLTs1kWcn9EITk7/view), updated 19 October 2026, in the [Brand Kit 2026](https://drive.google.com/drive/folders/1neioAQamq1g6Yr_Bg4P3g4Q1nYf_TtYM).

GitHub release `9311093` introduced the shared palette and Fredoka/Inter font families. This follow-up replaces the reconstructed wordmark with the supplied lockups and completes the logo, dark-surface, functional-UI and chart-label rules.

| Rule | Website implementation |
| --- | --- |
| Approved logo, original proportions and colours | Shared `Logo` uses the unchanged colour lockup on white and supplied white lockup on dark surfaces. The mark-only option remains for compact navigation. No CSS filters, stretched wordmarks or substituted lettering. |
| Deep purple primary/headings | `#5C2394`; supporting violet `#891D95`. |
| Accent, coral and calls to action | Magenta `#B51D8A`, coral `#E55B51`, orange `#FB9320`. Orange buttons use ink text for contrast. |
| Text | Ink `#2A1640`; white text on dark photographic overlays. |
| Typography | Fredoka for headings/big numbers; Inter for body, tables and UI. |
| Gradients | Original five stops retained for light-surface hero emphasis. Avatars, action icons and ordinary panels use solid brand colours. |
| Charts | Purple `#7B3FB8`, orange `#E07A10`, magenta `#B51D8A`, teal `#2A9D8F`; axis labels in ink. |
| Voice | Existing “Put out the fire.”, “Tap. Covered. Fire out.” and “No smoke. No hidden fees.” messaging retained. No promises of guaranteed approval added. |

## Asset provenance

Both apps serve byte-identical copies of the approved Drive artwork:

- `/brand/lockup.png`: [source](https://drive.google.com/file/d/1DOQT-DP-NGAg4VHGiqq3-A4MmBcOZgRg/view), 272436 bytes; SHA-256 `80ba4c17db98092d22b6ef64fb2d69ce937a9ad2d7a4198de031776ec530e050`.
- `/brand/lockup-white.png`: [source](https://drive.google.com/file/d/1EW9IjAIAT3Vx-CPkxynjIqXFlAh7ikU8/view), 178107 bytes; SHA-256 `a4b5ecce10ae0de350372bbf27daaf1b688fc100549692b68928350f7e99a105`.

Keep the source artwork intact. When updating it, compare the current Drive guide first and update both public asset directories together. The native mobile build is a separate distribution; this release publishes the website/PWA and back office.
