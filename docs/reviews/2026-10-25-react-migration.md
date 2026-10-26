# React frontend migration

The browser interface now uses React 19, TypeScript and Vite. Authentication,
overview, entry, handover, history, dialogs and AI chat are separate components.
The existing API contracts, database schema, registration gate and permission
checks are unchanged. No files in `src/`, `prisma/` or `.github/` were changed.

## Behavior and development

- Controlled fields preserve selection, drafts and original photo previews when
  navigating or changing preferences. Failed submissions retain unsent input.
- Session tokens and private drafts remain in memory. Expired sessions restore
  drafts only for the same account; explicit logout clears private state.
- Request generations prevent stale results from updating another session or
  composer. AI suggestions still require explicit operator review and saving.
- Existing mobile keyboard, keyboard navigation, bilingual labels, reduced motion
  and contrast behavior are retained. Panels and navigation receive small visual
  refinements. Connection timestamps now use the plant's Istanbul timezone.
- `npm run dev` builds/watches frontend assets and starts the API at
  `http://localhost:3000/app/`. Optional `dev:api` plus `dev:web` enables Vite Fast
  Refresh at port 5173. Both paths were smoke-tested, including watcher shutdown
  and preserving a form field through a Fast Refresh update.

Edit `frontend/`, not `public/`. The latter is generated and ignored by Git.
`npm run build` prepares both API and browser assets for `npm start`.
`npm test` also builds browser assets before the existing static-asset checks.
No database migration is needed for this change.

CI follow-up: the integration security suite also requests `/app/` to check
response headers. A clean checkout has no generated assets, so the integration
job initially passed 20 tests and failed this one with HTTP 404. The
`pretest:integration` hook now builds browser assets before that suite as well.
This preserves the security assertion and fixes the missing preparation step.

## Validation

Validation used Node 24.19 on Linux, system Chromium and a disposable PostgreSQL
17 database. Existing tests were retained without weakening their assertions.

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed |
| `npm run typecheck` (API, frontend and Vite configuration) | Passed |
| `npm run build` | Passed |
| `npm test` | 46 passed |
| `npm run test:integration` | 21 passed |
| All 14 Playwright suites, with a fresh server per suite | 66 passed |
| Default development watcher and optional Fast Refresh/proxy | Passed |
| Build with fake server-secret canaries | Canaries absent from browser output |
| Backend, Prisma and workflow diff | No changes |
| Previously installed dependency versions | No changes |

Four new browser tests cover field identity/caret and photo retention, session
and draft privacy across reloads, applying the saved theme before React loads,
and consistent Istanbul connection timestamps in both languages. Existing suites
cover registration, Excel export, AI review, conflicting edits, expired sessions,
stored markup, mobile layouts and theme contrast.

## Limits and follow-up

`npm audit --omit=dev --audit-level=high` currently reports two high and one
moderate advisory in existing backend dependencies: `body-parser` 2.3.0,
`multer` 2.4.0 and `fast-uri` 3.1.8. Auditing the original main-branch lockfile
returns the same findings. This migration adds React/build dependencies without
updating existing package versions or weakening the CI audit gate. A separate
backend dependency update is needed; the current CI audit step can fail.

Follow-up: the [dependency security update](2026-10-25-dependency-security.md)
resolves these baseline findings in a subsequent commit. Both production and
full dependency audits then report zero vulnerabilities.

React adds runtime JavaScript. The browser bundle is about 343 kB before
compression; Vite's approximately 103 kB gzip estimate is not a measured network
transfer or a performance improvement claim. Server compression remains a
deployment concern. No production load test was performed.

Physical Windows/Android devices, other browser engines, Node 22 and the remote
GitHub Actions run were not verified locally. The existing CI targets Node 22.
All local data and credentials used for integration tests were disposable test
values. Real API credentials and the server `.env` file are not frontend inputs.
