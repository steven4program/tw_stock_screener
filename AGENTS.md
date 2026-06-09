# AGENTS.md — Taiwan Stock Screener

Single source of truth for agents. **Keep this current: any change to commands, architecture, or conventions must update this file.** ≤80 lines.

## What this is
Daily after-close scan of all TWSE + TPEx stocks (~1,800–2,260). Surface stocks matching **Condition A (60MA/季線) OR Condition B (20MA/月線)**. Audience: a 65-year-old non-engineer (large font, high contrast). Stack: Next.js 15 (App Router) + TypeScript + Vercel + Supabase Postgres.

Each condition has 4 sub-conditions, all must hold (A vs B differ only in which MA):
1. 三大法人 net buy streak ≥ N days (N default 2, adjustable)
2. Director+supervisor holding ≥ X% (X default 15, adjustable)
3. MA today > yesterday, OR holdflat-5d MA > today's MA
4. (close − MA) / MA ∈ [0%, 10%]

MA = SMA of unadjusted close. A uses 60MA, B uses 20MA.

## Commands (run in `web/`)
```bash
npm install
npm run dev                              # next dev
npm run build
npm run test                             # vitest run (all pure-function tests)
npx vitest run lib/__tests__/signals.test.ts   # single file
npx vitest run -t "holdflat"                   # by test name
npx tsc --noEmit                         # type check
# Manual trigger / read snapshot (dev server up):
curl -X POST http://localhost:3000/api/jobs/run -H "authorization: Bearer <CRON_SECRET>"
curl http://localhost:3000/api/snapshots/latest
# First-time backfill (seed) — MUST run locally, ~10min > Vercel 300s limit:
cd web && set -a && . ./.env.local && set +a && \
  npx tsx -e "import('./lib/pipeline.ts').then(m=>m.runPipeline()).then(r=>console.log(JSON.stringify(r)))"
```

## Architecture
Data flow: **free TWSE/TPEx gov endpoints → Supabase (5 tables) → compute signals → API → frontend filters live.**
- `lib/signals.ts` — pure math: `sma`, `holdflat`, `buyStreak`, `changeRatio`, `computeSignals`. No I/O.
- `lib/filter.ts` — pure: `matchesA/B`, `runFilter(signals, {n,x})`, sort, summary.
- `lib/signal-builder.ts` — align price/inst/director/info → `StockSignal[]` (price trade-days are the spine; missing inst → null).
- `lib/marketdata.ts` — fetch+parse price & 三大法人 (TWSE/TPEx by-date; `getJson` has retry/timeout).
- `lib/director/` — monthly director holdings: `ingest.ts` (fetch), `datagov.ts`/`aggregate.ts` (parse/aggregate).
- `lib/repo.ts` — Supabase R/W; **every select goes through `selectAllPaged`**.
- `lib/pipeline.ts` — `ensureMarketData` (idempotent backfill) → read windows → `buildSignals` → `writeSignals`.
- `app/api/jobs/run` — Cron entry, CRON_SECRET-guarded, idempotency lock. `app/api/snapshots/latest` — serves latest successful snapshot (snake→camel).
- Tables: `stock_price_history`, `institutional_daily`, `director_holdings_monthly`, `daily_stock_signals`, `job_runs`. Schema + grants in `web/db/schema.sql`.

## Domain gotchas (stepped on before)
- **holdflat includes today**: `ma20_holdflat_5d = (Σ_{i=0..14} c[t-i] + 5×c[t]) / 20` (today counts 6×). Read spec §6.1 before touching `holdflat`.
- **Director aggregation**: keep rows whose title contains 董事 OR 監察人 AND NOT 法人代表; dedupe by name (max shares); divide by issued shares. Matches MOPS exactly (2330=6.52%, 6488=46.96%). Naive sum-all → 140%, wrong.
- **fail-closed**: any missing data → exclude the stock, set `eligibleA/B=false` + `exclude_reason`. Never guess/backfill to pass.
- **Supabase select caps at 1000 rows** → silent truncation across ~2,260 stocks. Always paginate via `selectAllPaged`.
- **Data source is free TWSE/TPEx, NOT FinMind** (free tier blocks whole-market). Gov endpoints flake → keep `getJson` retry/timeout + 300ms throttle.
- `SUPABASE_URL` = API URL (`https://<ref>.supabase.co`), NOT the Postgres connection string.
- New `sb_secret_…` keys need explicit service_role grants (in `schema.sql`), else 42501.
- Server-side env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) — NO `NEXT_PUBLIC_` prefix. Never read/print/commit `web/.env.local`.

## Conventions
- Per milestone: plan → execute → merge. Plans in `docs/superpowers/plans/`, specs in `docs/superpowers/specs/`. Execute via subagent-driven-development.
- Branch before working on `main`. Pure logic always has tests; keep `npm run test` green.
- Every commit message ends with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Coding principles (Karpathy-inspired; bias to caution over speed; use judgment on trivial tasks)
1. **Think before coding** — state assumptions, ask when unsure, surface tradeoffs and multiple interpretations; don't silently pick.
2. **Simplicity first** — minimum code that solves it; no unrequested features/abstractions/flexibility; if 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the request needs; don't refactor/reformat adjacent code; match existing style; only remove orphans your change created; mention unrelated dead code, don't delete it.
4. **Goal-driven** — turn tasks into verifiable goals (write the failing test first, then make it pass); loop until verified.
