# Dependency security update

The dependency audit reported two high and one moderate finding before this
update. Compatible releases fix all three affected packages without changing
application code, API contracts, database migrations or CI thresholds.

| Dependency | Previous | Updated | Finding |
| --- | --- | --- | --- |
| `body-parser` (through Express) | 2.3.0 | 2.4.0 | Denial of service from trailing bytes after a compressed request |
| `multer` | 2.4.0 | 2.5.0 | Denial of service during teardown with a pending asynchronous file filter |
| `fast-uri` (through Prisma tooling) | 3.1.8 | 3.1.9 | URI normalization, host and scheme confusion |

`body-parser` also requires `qs` 6.16.1, updated from 6.16.0. These are the only
four installed package versions changed; no packages were added or removed.
`package.json` now requires `multer` >=2.5.0 within major version 2. Existing
Express/Prisma version ranges accept the patched transitive dependencies, so no
new overrides or direct dependencies are necessary. Commit the lockfile and use
`npm ci` to reproduce the patched dependency tree.

The upload route uses a synchronous file filter, while the Multer advisory
specifically concerns a pending asynchronous filter. Updating still removes the
affected version. Image validation, upload limits and authentication stay intact.

## Validation

- Clean `npm ci`, `npm run build` and `npm run typecheck`: passed.
- `npm audit --omit=dev --audit-level=high`: passed, zero vulnerabilities.
- Full `npm audit --json`, including development dependencies: zero vulnerabilities.
- Unit/API tests: 47 passed.
- PostgreSQL 17 integration tests: 21 passed.
- Chromium browser tests: 66 passed across 14 suites, each with a fresh API server.

A new isolated-process regression test sends gzip and deflate requests, including
a completed member, a zero byte and 100 KiB of trailing data in a separate network
chunk. It waits after the response to catch late decoder errors. It verifies the API remains alive,
continues serving subsequent requests and rejects bodies exceeding the existing
16 KB limit after decompression without querying the database. Process isolation
and timeouts turn a decoder crash or hang into a test failure. Existing upload
security tests additionally cover invalid images, unsupported MIME types,
oversized files, excessive file counts, metadata removal and private photo access.
No existing security assertions were removed or weakened.

As a controlled baseline check, the same fixture was run with `body-parser`
2.3.0 loaded only in an isolated local child process. It exited with an unhandled
Gunzip `Z_DATA_ERROR`; with 2.4.0 it passed. This check used no real database or
external target and did not change the installed/persisted patched dependency tree.

Validation used Node 24.19 on Linux with a disposable test database and system
Chromium. Physical Windows/Android devices and Node 22 were not tested locally.
The remote GitHub Actions result is reported separately. An audit with zero
known advisories is not a guarantee that the entire application has no flaws.

Advisories: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m),
[URI schemes](https://github.com/advisories/GHSA-w74x-v6f9-j3xg),
[relative paths](https://github.com/advisories/GHSA-xhq7-xmqj-769h),
[hosts](https://github.com/advisories/GHSA-wjr9-j795-jxcr),
[suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp).
