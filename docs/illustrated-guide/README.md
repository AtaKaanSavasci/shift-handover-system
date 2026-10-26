# Illustrated project guide

A Turkish companion guide explaining the application, its technologies and the
trade-offs behind its design. It includes 21 chapters, six charts, code links,
an interactive request calculator and a concurrent-edit simulation.

- [PDF](guide.pdf): read or download the 21-page edition.
- [Interactive HTML](index.html): download and open locally in Chrome or Edge.
  It works offline without installation; GitHub displays its source rather than
  running it. Only the optional GitHub source links require internet access.
- [Chart files](charts/): standalone PNG and SVG versions of all six charts.
- [Measurement data](data.json): code inventory, tests, dependency audits,
  browser asset sizes and the synthetic photo experiment behind the charts.

The guide covers React/TypeScript state flow, Vite and Fast Refresh, the
Express/Prisma/PostgreSQL API, photos, Excel export, operator-reviewed AI,
concurrency, security, tests, CI and technology alternatives. The application
does not load these documentation files.

## Snapshot and measurement limits

This edition describes commit
[`5bd019c`](https://github.com/AtaKaanSavasci/shift-handover-system/tree/5bd019cb08a470abed17709b6ba85c1933458337)
from **October 25, 2026**. Source links are pinned to that snapshot. Its recorded
validation is 47 unit/API, 21 integration and 66 Chromium scenarios, with zero
known dependency audit findings and successful
[GitHub CI](https://github.com/AtaKaanSavasci/shift-handover-system/actions/runs/40211096363).
These are dated results, not live counters or a guarantee of no defects.

Photo measurements use a synthetic image, polling counts are an arithmetic
model, and gzip sizes are calculated estimates. They do not measure real-world
latency, server capacity or AI accuracy. The React migration's larger initial
JavaScript payload is shown alongside its maintenance benefits.

For current setup commands and API details, use the
[application guide](../application-guide.md).
