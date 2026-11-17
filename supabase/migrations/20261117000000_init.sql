-- TradePilot: initial schema
-- Single-user personal trading journal. Every table is scoped to auth.uid() via RLS.

create type trade_direction as enum ('LONG', 'SHORT');
create type trade_status as enum ('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- Account settings & risk framework (one row per user)
-- ---------------------------------------------------------------------------
create table account_settings (
  user_id               uuid primary key default auth.uid() references auth.users on delete cascade,
  starting_capital      numeric(14,2) not null default 1000 check (starting_capital > 0),
  risk_per_trade_pct    numeric(5,2)  not null default 1.5 check (risk_per_trade_pct > 0 and risk_per_trade_pct <= 100),
  daily_loss_limit_pct  numeric(5,2)  not null default 3   check (daily_loss_limit_pct > 0 and daily_loss_limit_pct <= 100),
  weekly_loss_limit_pct numeric(5,2)  not null default 6   check (weekly_loss_limit_pct > 0 and weekly_loss_limit_pct <= 100),
  min_reward_risk       numeric(6,2)  not null default 3   check (min_reward_risk > 0),
  max_open_positions    int           not null default 2   check (max_open_positions between 1 and 100),
  fractional_shares     boolean       not null default true,
  updated_at            timestamptz   not null default now()
);

-- ---------------------------------------------------------------------------
-- Trades (planned -> open -> closed | cancelled)
-- ---------------------------------------------------------------------------
create table trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  symbol       text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  company      text,
  direction    trade_direction not null,
  status       trade_status not null default 'PLANNED',
  entry_price  numeric(16,4) not null check (entry_price > 0),
  stop_loss    numeric(16,4) not null check (stop_loss > 0),
  take_profit  numeric(16,4) check (take_profit > 0),
  quantity     numeric(18,6) not null check (quantity > 0),
  exit_price   numeric(16,4) check (exit_price > 0),
  fees         numeric(12,2) not null default 0 check (fees >= 0),
  opened_at    timestamptz,
  closed_at    timestamptz,
  setup        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- stop must sit on the losing side of entry
  constraint stop_side check (
    (direction = 'LONG'  and stop_loss < entry_price) or
    (direction = 'SHORT' and stop_loss > entry_price)
  ),
  -- target (if any) must sit on the winning side of entry
  constraint target_side check (
    take_profit is null or
    (direction = 'LONG'  and take_profit > entry_price) or
    (direction = 'SHORT' and take_profit < entry_price)
  ),
  -- a closed trade needs an exit
  constraint closed_has_exit check (
    status <> 'CLOSED' or (exit_price is not null and closed_at is not null and opened_at is not null)
  ),
  constraint open_has_opened_at check (status <> 'OPEN' or opened_at is not null)
);

create index trades_user_status_idx on trades (user_id, status);
create index trades_user_closed_idx on trades (user_id, closed_at);

-- ---------------------------------------------------------------------------
-- Watchlist
-- ---------------------------------------------------------------------------
create table watchlist (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  symbol     text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  company    text,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trades_updated_at before update on trades
  for each row execute function set_updated_at();
create trigger account_settings_updated_at before update on account_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Create default settings for every new user
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table account_settings enable row level security;
alter table trades           enable row level security;
alter table watchlist        enable row level security;

create policy "own settings" on account_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own trades" on trades for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watchlist" on watchlist for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
