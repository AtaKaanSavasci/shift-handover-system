# Static asset compression and caching — November 4, 2026

Startup files are now compressed during the build and reused from the browser
cache on subsequent visits. Under the emulated mobile connection, median initial
login-screen readiness fell from **3.19 s to 1.81 s**; a return visit fell from
**3.15 s to 0.98 s**. These are local measurements, not production guarantees.

## Delivery changes

- Vite emits content-hashed JavaScript, CSS and the prepaint theme script.
  Changed content receives a new URL, including when using `npm run dev`.
- The build produces Brotli and gzip variants using Node's built-in compression.
  Express negotiates an available encoding, preserves the original MIME type,
  and sends `Vary: Accept-Encoding`. There is no per-request compression work
  or additional dependency.
- Hashed public assets use `public, max-age=31536000, immutable`. The HTML shell
  uses `no-cache` and ETag revalidation, so an ordinary revisit discovers a new
  release. Unversioned files revalidate, and missing files retain `no-store`.
- Authentication, operational APIs, Excel downloads and protected photos retain
  `no-store`. This change adds no service worker, offline operational data,
  database migration or persistent session storage.

The source entry remains `frontend/index.html`; `public/` is generated output.
The optional Vite development server retains its normal Fast Refresh behavior.

## Measurement method

The baseline uses the static files and `createApp` source from
[`ba102ce6cc319d33d1dce0ca365b73e403b465df`](https://github.com/AtaKaanSavasci/shift-handover-system/tree/ba102ce6cc319d33d1dce0ca365b73e403b465df).
Both variants use the same unchanged business modules and dependencies. Each
runs in its own Node 22 production container with **1 CPU and 512 MiB** limits.
Both servers passed HTTP readiness checks before measurement. Transport is
loopback HTTP; there is no reverse proxy, CDN or public-internet connection.

Chromium **154.0.8037.57** ran five fresh browser contexts per variant/profile,
alternating which variant ran first. Each context opened the anonymous login
screen, visited `about:blank`, returned to the application with the same cache,
and then reloaded. No requests were routed or mocked; caching remained enabled.
Readiness means a visible login form, an enabled login button on navigation,
and two animation frames. No login or operational API timings are included.

Desktop used a 1440×1000 viewport without artificial throttling. Mobile used
390×844, fourfold client CPU slowdown, 150 ms latency, 1.6 Mbps download and
750 Kbps upload. The generator and both servers shared the same host.

## Results

Values are medians of five trials; brackets show the observed minimum–maximum.

| Profile and visit | Before, ms | After, ms |
| --- | ---: | ---: |
| Desktop: initial | 583 [505–724] | 549 [505–613] |
| Desktop: return visit | 333 [282–417] | 350 [308–414] |
| Desktop: reload | 114 [112–128] | 111 [94–114] |
| Emulated mobile: initial | 3,188 [3,165–3,313] | 1,806 [1,708–1,868] |
| Emulated mobile: return visit | 3,148 [3,098–3,182] | 978 [969–1,079] |
| Emulated mobile: reload | 2,630 [2,608–2,644] | 474 [445–509] |

| Browser-reported transfer, both profiles | Before | After |
| --- | ---: | ---: |
| Initial HTML + four assets | 400,932 B | 115,938 B |
| Return/reload HTML + four assets | 400,932 B | 300 B |
| Return/reload asset transfer alone | 400,075 B | 0 B |

The browser negotiated gzip in this experiment. Initial transfer fell **71.1%**;
mobile initial readiness improved **43.3%**, and mobile return readiness improved
**68.9%**. All ten updated contexts reused all four cached assets on return and
reload. The remaining transfer is the browser's estimate for HTML revalidation.
`PerformanceResourceTiming.transferSize` includes an estimated header allowance;
these values are not packet captures or exact wire bytes.

Desktop readiness ranges overlap substantially, and return visits were slightly
slower in this sample despite eliminating asset downloads. There is no convincing
desktop timing improvement demonstrated here. The application still parses and
executes JavaScript on each load; cached files do not remove that work.

All 20 contexts completed without JavaScript errors, failed requests or horizontal
overflow. See the [raw measurements](static-assets-2026-11-04/browser-ab.json)
and [summary](static-assets-2026-11-04/summary.json). This comparison is separate
from the earlier [API performance baseline](2026-11-03-performance-baseline.md).

## Validation

- Production build and `npm run typecheck`: passed.
- `npm test`: **52/52**, including five new delivery tests for compressed bytes,
  MIME, encoding negotiation, ETags/HEAD, cache invalidation and private responses.
- PostgreSQL 17 integration tests: **21/21** against a disposable database.
- All 15 Chromium browser suites: **67/67**, including a new unmocked cache-reuse
  test. Existing theme, registration, authorization and photo tests still pass.
- One-command development smoke check: changing the theme script changed its
  hashed URL, served the changed content, and restored the original hash after
  reverting the temporary edit.
- `npm audit --omit=dev --audit-level=high`: exited successfully. The audit reported
  eight moderate findings through the existing ExcelJS/minimatch dependency chain;
  dependency versions are unchanged by this work.

GitHub Actions has not been verified at the time of this report. Physical Android,
iOS/Safari, Windows installation and public hosting/CDN behavior were not tested.
Five local trials do not establish field Core Web Vitals, population percentiles,
API throughput improvements or the speed of an authenticated overview.
