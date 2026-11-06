-- xmaze database schema.
-- Apply in the Supabase SQL editor, or via `supabase db push` after
-- `supabase link`. Realtime rooms need no tables (they run over broadcast +
-- presence); only the leaderboard is persisted.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 24),
  solve_ms    integer not null check (solve_ms >= 0),
  won         boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Fastest winning solves first — the leaderboard's main query.
create index if not exists scores_leaderboard_idx
  on public.scores (won, solve_ms);

alter table public.scores enable row level security;

-- Anyone may read the leaderboard.
drop policy if exists "scores readable" on public.scores;
create policy "scores readable"
  on public.scores for select
  using (true);

-- Anyone may submit a score. The CHECK constraints above bound the values;
-- tighten later with auth if you add accounts.
drop policy if exists "scores insertable" on public.scores;
create policy "scores insertable"
  on public.scores for insert
  with check (char_length(name) between 1 and 24 and solve_ms >= 0);
