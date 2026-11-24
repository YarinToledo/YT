-- Research module: per-user draft, versioned investment policy, and an append-only decision journal.
-- Safe to run more than once.

-- Current research draft (one per user) and the status of each learning principle.
create table if not exists research_drafts (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  draft      jsonb not null default '{}'::jsonb,
  rules      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Every saved policy is a new version; old versions are never changed.
create table if not exists research_policies (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  version    int  not null check (version >= 1),
  status     text not null check (status in ('draft', 'active')),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

-- A decision keeps a frozen copy of the analysis, the assessment and the policy version at that moment.
create table if not exists research_decisions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  decision    text not null check (decision in ('watch', 'consider', 'hold', 'reduce', 'pass', 'more')),
  reason      text not null check (length(reason) <= 16000),
  review_date date,
  data        jsonb not null,
  assessment  jsonb not null,
  policy      jsonb not null,
  rules       jsonb not null default '{}'::jsonb,
  imported    boolean not null default false
);
create index if not exists research_decisions_user_created on research_decisions (user_id, created_at desc);

-- Later reviews are added to a decision; they never rewrite it.
create table if not exists research_reviews (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references research_decisions on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  note        text not null check (length(note) <= 16000)
);
create index if not exists research_reviews_decision on research_reviews (decision_id, created_at);

alter table research_drafts    enable row level security;
alter table research_policies  enable row level security;
alter table research_decisions enable row level security;
alter table research_reviews   enable row level security;

drop policy if exists "own research draft" on research_drafts;
create policy "own research draft" on research_drafts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Policies, decisions and reviews: read and add only (no update, no delete).
drop policy if exists "read own policies" on research_policies;
drop policy if exists "add own policies" on research_policies;
create policy "read own policies" on research_policies for select using (user_id = auth.uid());
create policy "add own policies" on research_policies for insert with check (user_id = auth.uid());

drop policy if exists "read own decisions" on research_decisions;
drop policy if exists "add own decisions" on research_decisions;
create policy "read own decisions" on research_decisions for select using (user_id = auth.uid());
create policy "add own decisions" on research_decisions for insert with check (user_id = auth.uid());

drop policy if exists "read own reviews" on research_reviews;
drop policy if exists "add own reviews" on research_reviews;
create policy "read own reviews" on research_reviews for select using (user_id = auth.uid());
create policy "add own reviews" on research_reviews for insert with check (
  user_id = auth.uid()
  and exists (select 1 from research_decisions d where d.id = decision_id and d.user_id = auth.uid())
);
