# Shift Handover System

[![CI](https://github.com/AtaK123456/shift-handover-system/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AtaK123456/shift-handover-system/actions/workflows/ci.yml)

An industrial shift logbook that helps operators pass important alerts and
unfinished work to the next shift. Built around GT1, GT2 and ST turbine operations.

## Features

- Overview of equipment status, important alerts and ongoing work.
- Shift schedules, handover acknowledgments and searchable history.
- Photos, progress notes, responsible teams and next steps.
- Excel export, Turkish/English interface, light/dark themes and mobile layouts.
- Optional AI chat with evidence and review suggestions; the operator makes the final decision.

**Stack:** React 19, TypeScript, Vite, Express 5, Prisma 7 and PostgreSQL.

## Quick start

Requires **Node.js 22.12+ (22.x) or 24+** and PostgreSQL (CI uses version 17).

```sh
git clone https://github.com/AtaK123456/shift-handover-system.git
cd shift-handover-system
npm ci
cp .env.example .env
```

On Windows PowerShell, replace `cp` with `Copy-Item .env.example .env`.
Configure these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection string. |
| `JWT_SECRET` | A random secret of at least 32 bytes. |
| `REGISTRATION_CODE` | A separate 12–128 character code to enable signup. Empty means registration is closed. |

Secret generation commands are included in [.env.example](.env.example).
Run each command below only after the previous one succeeds:

```sh
npx prisma migrate deploy
npm run build
npm start
```

Open **http://localhost:3000/app/**. For development, use `npm run dev`.
React source lives in `frontend/`; Vite builds it into `public/`, served by the API.
`npm run dev` watches both frontend and backend at the same address.
See the [React development guide](docs/application-guide.md#react-frontend) for Fast Refresh.

AI is disabled by default. To enable it, configure `AI_ENABLED`, `OPENAI_API_KEY`
and `OPENAI_MODEL` as described in the [AI setup guide](docs/application-guide.md#configuration).
OpenAI API billing is separate from a ChatGPT subscription.

## Public demo and deployment

`DEMO_MODE=true` turns an instance into a public demo: the sign-in page offers one-click
**Operator / Supervisor / Manager** access, and the database is filled with three weeks of
realistic plant history (shifts, open and closed work, progress notes, unit status changes).
The data is wiped and reseeded every `DEMO_RESET_HOURS` (default 24), in `DEMO_LANGUAGE`
(`tr` or `en`). **Seeding deletes every record**, so always give the demo its own database;
it refuses to run if the database contains non-demo accounts.

To load demo data manually: `DEMO_MODE=true npm run demo:seed` (after `npm run build`).

**Deploy on Render (free):**

1. Create a free PostgreSQL database, e.g. on [Neon](https://neon.tech), and copy its connection string.
2. In Render choose **New → Blueprint**, select this repository; [render.yaml](render.yaml) is picked up.
3. Paste the connection string as `DATABASE_URL`. `JWT_SECRET` is generated for you.

The [Dockerfile](Dockerfile) runs `prisma migrate deploy` on start and works on any
Docker host (Railway, Fly.io, a VPS). Set `TRUST_PROXY=1` behind one reverse proxy so
rate limits see real client IPs. `GET /healthz` reports database connectivity.
Free Render instances sleep when idle; the first request after a pause takes ~30–60 s.

## Tests

After installing dependencies and generating the Prisma client:

```sh
npx prisma generate
npm run typecheck
npm test
```

Integration and browser tests require a **disposable, migrated PostgreSQL database**.
See [test setup](docs/application-guide.md#tests). CI runs checks, dependency
auditing, integration tests and isolated Chromium suites.

## Security and documentation

Registration requires the team code, and new accounts always receive the WORKER
role. Use HTTPS in production and keep `.env` and secrets out of Git.
**Logout does not yet revoke issued tokens; they expire after eight hours.**

- [Application guide](docs/application-guide.md): setup, updates, troubleshooting, API and feature details.
- [Illustrated project guide (Turkish)](docs/illustrated-guide/README.md): architecture, React, charts, design trade-offs and security results; PDF and offline HTML.
- [Performance baseline](docs/reviews/2026-11-03-performance-baseline.md): dated API/browser measurements, resource limits and improvement options; Turkish PDF/HTML report.
- [Backend improvements](docs/reviews/2026-11-05-backend-performance.md): request timings, query/index changes, workload limits and measured before/after results.
- [UI refresh](docs/reviews/2026-11-08-ui-modernization.md): design decisions, screenshots, accessibility checks and browser performance comparison.
- [Security assessment](docs/reviews/2026-10-24-security-assessment.md): tested boundaries, fixes and remaining risks.
- [Contribution conventions](docs/application-guide.md#contribution-language): English documentation and `AtaK/` working branches.
