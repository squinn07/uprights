-- Uprights shared leaderboard.
-- Paste all of this into Supabase: SQL Editor > New query > Run.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 14),
  team       text not null check (team ~ '^[A-Z]{2,3}$'),
  score      int  not null check (score between 1 and 3000),
  threes     int  not null check (threes >= 0),
  ones       int  not null check (ones >= 0),
  made       int  not null check (made = threes + ones),
  longest    int  not null default 0 check (longest between 0 and 70),
  -- the score has to add up: 3 per middle-third kick, 1 per outside-third kick
  check (score = threes * 3 + ones)
);

create index if not exists scores_rank on public.scores (score desc, threes desc, made desc, created_at);

-- Anyone can read the board and add a score; nobody can edit or delete through the game.
alter table public.scores enable row level security;
drop policy if exists "anyone can read scores" on public.scores;
drop policy if exists "anyone can add a score" on public.scores;
create policy "anyone can read scores" on public.scores for select to anon using (true);
create policy "anyone can add a score" on public.scores for insert to anon with check (true);
grant select, insert on public.scores to anon;
