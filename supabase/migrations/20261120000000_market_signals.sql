-- Live market signals pushed by the IBKR worker (see worker/ibkr).
-- Written only by the `ingest` Edge Function (service role); readable by signed-in users.
-- This is a single-user app with sign-ups disabled, so the rows are not scoped per user.

create table if not exists market_signals (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('orb', 'hot_snapshot', 'heartbeat')),
  trading_day date not null,
  symbol      text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists market_signals_day_kind on market_signals (trading_day desc, kind, created_at desc);
-- One ORB signal per symbol per day (re-sends update it). Snapshot/heartbeat rows have a null symbol,
-- and nulls never collide, so those still append.
do $$ begin
  alter table market_signals add constraint market_signals_kind_day_symbol unique (kind, trading_day, symbol);
exception when duplicate_table or duplicate_object then null;  -- already there (re-run)
end $$;

alter table market_signals enable row level security;

drop policy if exists "signed-in users read signals" on market_signals;
create policy "signed-in users read signals" on market_signals for select
  to authenticated using (true);
-- No insert/update/delete policies: only the service role (ingest function) writes.
