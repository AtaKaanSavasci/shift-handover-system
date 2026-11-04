# Performance assessment — November 3, 2026

The application handled the modeled ten-session polling workload comfortably in
this local experiment. Under the no-think-time stress workload, reducing the application CPU
allowance increased latency substantially. The clearest initial optimization is
static-file delivery; adding indexes improved query plans without demonstrating
an end-to-end application speedup at this dataset size.

Measured source:
[`f123f6e47125816d4ca871b4075a2ba9435ede9e`](https://github.com/AtaKaanSavasci/shift-handover-system/tree/f123f6e47125816d4ca871b4075a2ba9435ede9e).
Read the nine-page [Turkish PDF](performance-2026-11-03/report-tr.pdf),
[interactive HTML](performance-2026-11-03/report-tr.html), and
[measurement summary](performance-2026-11-03/summary.json).
The [reproduction package](performance-2026-11-03/measurement-package.zip) includes
raw samples, correction records, harness scripts and Linux/Docker setup notes.

## Conditions and method

Production build, Node 22.23.4 and PostgreSQL 17.11 ran in separate containers.
Application profiles were **1 CPU/512 MiB** and **0.1 CPU/512 MiB**; PostgreSQL
remained at **0.5 CPU/512 MiB**. The shared host had a two-CPU parent quota and
8 GiB memory limit. The load generator used that same host. Transport was
loopback HTTP and Docker networking, without public-internet latency or TLS.

Each profile started with ten synthetic users, 3,010 shifts, 10,000 records,
120 open items, 3,000 progress notes, 300 work-history changes and 500 photos.
The test photo was a 1,600×1,200 JPEG of 284,965 bytes. Writes subsequently added
32 records and eight photos per profile. Authentication and application rate
limits remained enabled; no real credentials, production data or paid AI calls
were used.

The read mix equally weighted three GETs: `/operations/summary`,
`/shifts/current` and `/operations/entries?view=open&page=1`.
The normal model staggered ten sessions, each issuing those three requests every
30 seconds: **60 requests over 60 seconds, averaging one request/second**.
Closed-loop stress had no think time and used **three 12-second trials** per
concurrency level. Concurrent HTTP requests are not concurrent human users.
Latency covers dispatch through reading the complete response body. Throughput
is completed requests divided by elapsed time, including draining outstanding
requests.

## API results

| Workload | 1 CPU | 0.1 CPU |
| --- | ---: | ---: |
| Normal ten sessions: p95 latency | 34.37 ms | 298.61 ms |
| Stress, ten concurrent HTTP requests: median throughput | 146.17 req/s | 17.96 req/s |
| Same stress: median trial p95 | 177.85 ms | 1,302.86 ms |

Stress figures are the median of three trial throughput values and three trial
p95 values, respectively; they are not pooled percentiles. At 1 CPU,
concurrency 30 produced **143.05 req/s / 319.73 ms p95**, and concurrency 50
produced **142.70 req/s / 530.57 ms p95**. Throughput plateaued while latency grew;
this does not identify application CPU alone as the bottleneck.

The **22,774 scored warm-service API samples** comprised 21,372 at 1 CPU and
1,402 at 0.1 CPU. All returned 2xx without transport errors. This is not a claim
that every preparation request succeeded or that the application has no defects.

Excel export of 3,010 shifts had only three samples/profile; the slowest was
974.33 ms at 1 CPU and 9,384.01 ms at 0.1 CPU. Other small samples included six
logins and eight photographed records/profile. Their nearest-rank p95 is the
maximum, not a stable production tail estimate. One-second RSS sampling observed
peaks of 294.4/273.4 MiB; short peaks or long-term leaks remain untested.

## Browser results

Five trials/profile produced these descriptive medians:

| View ready | Desktop | Emulated mobile |
| --- | ---: | ---: |
| Initial login screen | 532.5 ms | 3,258.2 ms |
| Same-context reload | 158.8 ms | 2,691.5 ms |
| Login → populated overview | 159.7 ms | 651.1 ms |
| Handover page | 111.0 ms | 503.9 ms |
| History page | 94.6 ms | 369.9 ms |

Mobile used Chromium emulation, fourfold client-CPU slowdown, 150 ms latency and
1.6 Mbps download, against the warm **1 CPU backend**. These are readiness
measurements, not INP, Lighthouse scores or physical-phone results. No browser
errors or horizontal overflow were observed. All five static files were served
uncompressed with `no-store`; both first load and reload downloaded 399,432 body
bytes. Calculated gzip totals were 114,149 bytes, a size estimate rather than a
measured speedup.

## Improvements, in order

1. **Static delivery and observability:** enable gzip/Brotli, safe revalidation,
   then hashed assets before immutable caching. Keep private APIs/photos
   uncached. Add readiness and request-duration/error metrics without secrets.
2. **Summary/request efficiency:** measure repeated queries, cancellation and
   revision-based shared data reuse while preserving consistent snapshots,
   user-specific acknowledgments and shift-window rollover.
3. **Expensive operations:** clearer photo/export progress and bounded image
   concurrency before buffering; prefer filtered exports before background jobs.
4. **Growth optimizations:** evaluate indexes, selective-search trigram/full-text
   options and cursor pagination with larger datasets and write-cost checks.

Temporary `OperationPhoto(entryId)` and `Shift(userId,startTime,id)` indexes
improved SQL execution medians from 0.045→0.023 ms and 0.2225→0.0305 ms.
Client-wall medians did not materially improve. Both probe indexes were removed;
application code, schema and migrations remain unchanged.

## Existing features to improve and new options

Improve existing flows with entry-creation idempotency, staged photo progress
with retry/cancel, clearer stale-data feedback and actual obsolete-request
cancellation, and AI cancellation/cost guidance while retaining explicit review.

Small new options are saved personal filters, changes since the last
acknowledgment, an optional human-review date, and a read-only synthetic portfolio
demo. These do not require new roles or a general SaaS redesign.

## Corrections and limits

An initial 0.1 CPU polling run began before readiness and retained twelve
`ECONNRESET`s in `api-0.1cpu-initial.json`. Only that case was replaced after HTTP
readiness, thirty successful warmups and a fresh equivalent fixture. The initial
1 CPU export timing wrapper was also corrected by rerunning three exports in a
fresh process inside the measurement/SQL window; other cases were unchanged.
Raw correction files in the linked reproduction package preserve the audit trail;
correction metadata is also recorded in the measurement summary.

These short, sequential, warm-cache runs do not establish maximum production
capacity, cloud-provider performance, hosting cold starts, long-duration
stability, worst-case uploads or AI latency. Verify the selected deployment
region, network and resource plan before treating these figures as service
objectives.
