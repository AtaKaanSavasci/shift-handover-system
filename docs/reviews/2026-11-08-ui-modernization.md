# Industrial dashboard UI refresh — 2026-11-08

The dashboard now uses cool gray surfaces, indigo actions, clearer grouping and
restrained feedback. Green still indicates active/success states; amber and red
retain their operational meanings. The four existing pages and all data-entry,
handover, history and AI workflows are preserved.

Product changes are confined to `frontend/styles.css`. No application JavaScript,
API, database schema, dependency or external font was added. Comparison baseline:
`3596135` on `main`, using the same lockfile and production build toolchain.

## Design decisions

Applied the official
[UI UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/4f2dbb67e64969a9a30ab00742f2d55d66ddec2b/.claude/skills/ui-ux-pro-max/SKILL.md),
pinned to `4f2dbb67e64969a9a30ab00742f2d55d66ddec2b`. Its Python search and web
reference informed minimal styling, contrast, focus, touch and motion behavior.
The generated marketing hero/CTA layout was unsuitable for an industrial logbook
and was discarded after one narrower search. Existing navigation and the user's
gray/indigo preference take precedence over those stock suggestions. This skill
was used from its source checkout; it was not installed into the user's machine.

The [design system](../../design-system/shift-handover-system/MASTER.md) records
the palette, component tokens, motion rules and provenance. Implementation:

- Shared light/dark tokens control surfaces, action states, focus and boundaries.
  System fonts and existing status labels remain in use.
- Consistent control/card/panel corners and small static shadows clarify groups.
  Actionable observation cards have a decorative chevron; information-only
  counters and equipment cards remain stationary.
- Fine-pointer hover provides color feedback and a 2px card lift. Button presses
  move 1px only when motion is allowed. Touch gets pressed colors and native tap
  highlighting without hover movement. Keyboard focus and activation remain clear.
- Feedback transitions last 150ms. The existing page entrance remains 200ms and
  does not delay navigation or data loading. Reduced motion disables transitions
  and decorative movement. No animation library, remote font, permanent layer
  hint, animated shadow or blur was introduced.

## Screenshots

All examples use synthetic records and a demo operator. These are viewport
captures, so mobile fixed navigation is shown at the actual viewport bottom.

| View | Before | After |
| --- | --- | --- |
| Desktop, light | [Baseline](ui-modernization-2026-11-08/baseline-desktop-light.png) | [Updated](ui-modernization-2026-11-08/desktop-light.png) |
| Mobile, dark | [Baseline](ui-modernization-2026-11-08/baseline-mobile-dark.png) | [Updated](ui-modernization-2026-11-08/mobile-dark.png) |
| Desktop, dark | — | [Updated](ui-modernization-2026-11-08/desktop-dark.png) |
| Mobile, light | — | [Updated](ui-modernization-2026-11-08/mobile-light.png) |

Full-page review also covered login and all four pages in both themes and both
desktop/mobile layouts: 40 before/after images. No horizontal overflow, browser
error, failed resource or external resource request was observed in that harness.

## Performance evidence

Both production builds were served by the same local Node 24.19.0 process and
the existing compressed-asset middleware. Chromium 154.0.8037.57 used five fresh
contexts per variant/profile in alternating order. Each context loaded the
anonymous login screen, visited `about:blank`, and returned with the same cache.
This startup mode has no API mocks, request routing, cache disabling or service
worker. Readiness means the auth view and enabled login button are available,
plus two animation frames; it is not a field Core Web Vitals measurement.

Desktop was 1440×1000 without artificial throttling. Mobile was 390×844 with 4×
client CPU slowdown, 150ms network latency, 1.6Mbps download and 750Kbps upload.
This measures client delivery, not API throughput or production hosting capacity.

| Login ready, ms | Before median (range) | After median (range) |
| --- | --- | --- |
| Desktop, first visit | 866 (769–909) | 862 (714–1,078) |
| Desktop, revisit | 398 (384–499) | 440 (372–607) |
| Emulated mobile, first visit | 2,451 (2,191–2,965) | 2,320 (2,230–2,405) |
| Emulated mobile, revisit | 1,442 (1,392–2,117) | 1,473 (1,391–1,744) |

Ranges overlap and the sample is small. These observations support a low-cost
visual refresh, not a demonstrated startup speed improvement. No layout shifts,
overflow, failed resources, external requests or browser errors were observed in
the startup samples. The recorded layout-shift sum is local, not field CLS.

| Payload | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main JS, decoded bytes | 343,591 | 343,591 | 0 |
| CSS, minified bytes | 54,084 | 56,420 | +2,336 |
| CSS, gzip bytes | 11,279 | 11,732 | +453 |
| CSS, Brotli bytes | 10,771 | 11,157 | +386 |
| First-visit total transfer bytes, browser-reported | 116,000 | 116,453 | +453 / +0.39% |
| Revisit asset transfer bytes | 0 | 0 | 0 |

The main JavaScript is byte-identical, SHA-256:
`4f76cc13ed6951838e8fad01bdad498b5bf1b47656d598808278858ed95f2ff2`.
Its generated filename changes with the build graph. All 20 same-version revisit
samples reused the assets with zero asset transfer; only the HTML revalidation
contributed the browser-reported 300 transfer bytes. The existing immutable asset
cache and HTML revalidation behavior are preserved.

Navigation used a separate synthetic API fixture to isolate client rendering:
five fresh contexts per variant/profile, four destinations each, 80 samples.
Network throttling was disabled for this mode; mobile CPU remained at 4×. Routing
disables HTTP cache equally for both variants. The timer runs from the browser's
click event until the destination is visible plus two animation frames, without
waiting for the decorative transition to finish. It is neither API latency nor
field INP. Median milliseconds:

| Destination | Desktop before → after | Emulated mobile before → after |
| --- | ---: | ---: |
| New record | 105 → 76 | 155 → 142 |
| Handover | 110 → 120 | 295 → 293 |
| History | 101 → 125 | 216 → 242 |
| Overview | 84 → 105 | 187 → 160 |

Results vary by page, with overlapping before/after ranges. History's mobile
median increased by 26ms; overview's decreased by 27ms. This small local run does
not establish a reliable change in interaction speed. Full ranges and payload
inventories are in [summary.json](ui-modernization-2026-11-08/summary.json).
The [measurement package](ui-modernization-2026-11-08/measurement-package.zip)
contains raw observations, scripts, fixture, method and local validation logs.
Physical-device profiling should precede any further animation or render changes.

## Validation and limits

| Check | Result |
| --- | --- |
| Production build and frontend build | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 60/60 passed |
| `npm run test:integration` | 23/23 passed against disposable PostgreSQL 17 |
| Chromium browser suites | 75/75 passed across 16 isolated suites |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities reported |

Five new browser cases cover light/dark action contrast in normal/hover/pressed
states, stationary information cards, keyboard focus and dialog return, touch
activation/feedback configuration and reduced-motion navigation/draft retention.
Existing security, registration, contrast, cache, mobile and workflow assertions
were retained. The full browser run used the existing CI Playwright config;
the new motion tests explicitly opt into the media settings they exercise.

Browser automation used installed Chromium on Linux with a mobile viewport,
touch emulation and synthetic records. Physical Android/iOS devices, Safari,
Firefox and production field performance were not verified. Headless Chromium
does not expose held-touch `:active` or native highlight pixels reliably: the
test checks native highlight configuration, compatibility-mouse pressed styling,
real tap activation and absence of sticky hover. It does not claim a physical
phone's native highlight was visually tested.
