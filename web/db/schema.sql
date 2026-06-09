-- web/db/schema.sql — 在 Supabase SQL Editor 執行（建立 5 張表）
create table if not exists stock_price_history (
  stock_id text not null,
  trade_date date not null,
  open numeric, high numeric, low numeric, close numeric,
  volume_lots numeric,
  primary key (stock_id, trade_date)
);

create table if not exists institutional_daily (
  stock_id text not null,
  trade_date date not null,
  net_lots numeric not null,
  primary key (stock_id, trade_date)
);

create table if not exists director_holdings_monthly (
  stock_id text not null,
  data_month text not null,                 -- 'YYYY-MM'
  director_holding_pct numeric not null,
  primary key (stock_id, data_month)
);

create table if not exists daily_stock_signals (
  data_date date not null,
  stock_id text not null,
  stock_name text,
  market text,                              -- 'TWSE' | 'TPEx'
  close numeric,
  change_ratio numeric,
  volume_lots numeric,
  inst_net_lots numeric,
  inst_buy_streak int,
  director_holding_pct numeric,
  director_data_month text,
  ma20 numeric, ma20_prev numeric, ma20_holdflat_5d numeric,
  ma60 numeric, ma60_prev numeric, ma60_holdflat_5d numeric,
  dist_ma20_ratio numeric, dist_ma60_ratio numeric,
  eligible_a boolean, eligible_b boolean,
  exclude_reason_a text, exclude_reason_b text,
  primary key (data_date, stock_id)
);

create table if not exists job_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  data_date date,
  status text not null,                     -- running|success|partial_success|failed|no_new_data
  stocks_processed int default 0,
  eligible_a_count int default 0,
  eligible_b_count int default 0,
  excluded_count int default 0,
  exclude_stats jsonb,
  error_message text
);

-- 取「最新成功快照日期」與「防重複鎖」用的索引
create index if not exists idx_job_runs_status_started on job_runs (status, started_at desc);
create index if not exists idx_signals_data_date on daily_stock_signals (data_date);

-- 授權給 service_role（後端 API 用 sb_secret_ 金鑰，以 service_role 身分存取）。
-- 新專案有時不會自動授權，導致 42501 permission denied；以下明確授權並涵蓋未來新表。
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
