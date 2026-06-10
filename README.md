# 台股選股器 · Taiwan Stock Screener

**English** | [繁體中文](./README.zh-TW.md)

[![CI](https://github.com/steven4program/tw_stock_screener/actions/workflows/ci.yml/badge.svg)](https://github.com/steven4program/tw_stock_screener/actions/workflows/ci.yml)

A daily, after-close technical screener for the **entire Taiwan stock market** (TWSE + TPEx, ~1,800–2,260 stocks). It runs automatically every evening, applies two moving-average strategies, and presents the matches in an interface designed for a **non-technical 65-year-old** — large fonts, high contrast, and plain-language explanations of *why* each stock matched.

> ⚠️ **Not investment advice.** This is an educational/technical-screening tool. It does not constitute a recommendation to buy or sell any security. Always do your own research.

---

## What it does

Every evening after market close, it scans all listed stocks and surfaces those matching **Condition A (季線 / 60-day MA) _or_ Condition B (月線 / 20-day MA)**.

Each condition has **4 sub-conditions, all of which must hold** (A and B differ only in which moving average they use):

1. **三大法人 net-buy streak ≥ N days** — institutional investors bought net for at least N consecutive days (N default **2**, adjustable in the UI).
2. **Director & supervisor holding ≥ X%** — insider ownership above a threshold (X default **15%**, adjustable).
3. **MA trending up** — today's MA > yesterday's, _or_ the holdflat-5d MA > today's MA.
4. **Close near the MA** — `(close − MA) / MA` is within `[0%, 10%]`.

`MA` is a simple moving average of the unadjusted close. **Condition A uses the 60-day MA; Condition B uses the 20-day MA.**

The two adjustable parameters (**N** and **X**) are tuned live in the browser — no re-run needed.

## Highlights

- **Accessibility-first UI** — body text scales with the browser/OS font size (`rem`), all contrast meets WCAG AA, touch targets ≥ 44px, and three skins (`default`, `paper`, `bold`).
- **Plain-language "看原因" (see why)** — every match expands into human-readable reasons (e.g. "三大法人連買 9 天（門檻 ≥ 2 天）").
- **Taiwan colour convention** — red = up, green = down, with status colours kept separate from price colours.
- **Honest data states** — the UI clearly distinguishes `success`, `partial` (some data reused), `stale`, `failed`, and `no_data`, so you always know how fresh the numbers are.
- **fail-closed** — any missing data excludes a stock rather than guessing, so a displayed match is always backed by complete data.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) + TypeScript |
| Data store | Supabase (Postgres) |
| Hosting / CD | Vercel (auto-deploy + daily Cron) |
| Data source | Free TWSE / TPEx government endpoints |
| Tests | Vitest (unit) + Playwright (e2e) |
| CI | GitHub Actions |

## Architecture

```
free TWSE/TPEx gov endpoints  →  Supabase (5 tables)  →  compute signals  →  API  →  frontend filters live
```

- **`web/lib/signals.ts`** — pure math (`sma`, `holdflat`, `buyStreak`, `changeRatio`), no I/O.
- **`web/lib/filter.ts`** — pure `matchesA/B`, `runFilter`, sort, summary (drives the live UI filtering).
- **`web/lib/pipeline.ts`** — idempotent backfill → read windows → build signals → write snapshot.
- **`web/app/api/jobs/run`** — Cron entry (guarded by `CRON_SECRET`); **`/api/snapshots/latest`** serves the latest successful snapshot.
- Tables: `stock_price_history`, `institutional_daily`, `director_holdings_monthly`, `daily_stock_signals`, `job_runs` (schema in `web/db/schema.sql`).

The daily refresh runs as a Vercel Cron at **22:00 Taiwan time** (`0 14 * * *` UTC).

> Full architecture, domain gotchas, and contributor conventions live in **[`AGENTS.md`](./AGENTS.md)** — the single source of truth for development.

## Project structure

```
.
├── web/              # Next.js app (all application code)
│   ├── app/          # App Router pages + API routes
│   ├── components/   # React components (screener UI)
│   ├── lib/          # signals, filter, pipeline, data fetching, Supabase repo
│   ├── db/           # schema.sql
│   └── e2e/          # Playwright tests
├── docs/             # design notes & plans
├── AGENTS.md         # development guide (commands, architecture, conventions)
└── .github/workflows # CI
```

## Getting started

All application commands run inside `web/`.

### 1. Prerequisites
- Node.js 20+
- A Supabase project (Postgres)

### 2. Environment
Create `web/.env.local` (server-side only — never commit it):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase **API** URL — `https://<ref>.supabase.co` (not the Postgres connection string) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only; bypasses RLS) |
| `CRON_SECRET` | Bearer token guarding `POST /api/jobs/run` |

Apply the database schema (`web/db/schema.sql`) to your Supabase project.

### 3. Install & run
```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### 4. First-time data backfill
The initial backfill (~10 min) exceeds Vercel's 300s function limit, so seed it **locally**:
```bash
cd web && set -a && . ./.env.local && set +a && \
  npx tsx -e "import('./lib/pipeline.ts').then(m=>m.runPipeline()).then(r=>console.log(JSON.stringify(r)))"
```
After that, the daily Vercel Cron keeps it fresh (it only backfills missing days — idempotent and self-healing).

## Testing

```bash
cd web
npm run lint         # eslint
npm run test         # vitest (pure-function unit tests)
npm run e2e          # next build + playwright (uses fixtures, no DB needed)
npx tsc --noEmit     # type check
```

## CI / CD

- **CI** — [GitHub Actions](./.github/workflows/ci.yml) runs lint + unit + e2e on every pull request and push to `main`. The e2e suite uses a fixture seam (`E2E=1`), so CI needs no secrets.
- **CD** — Vercel auto-deploys on push; the daily Cron refreshes the snapshot at 22:00 TW.
- `main` is protected: changes land via pull requests that must pass CI.
