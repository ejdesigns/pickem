-- Pick'em MVP schema
-- Run this in your Supabase project: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.games (
  id text primary key,                    -- ESPN event id, e.g. "401772897"
  season int not null,                    -- e.g. 2026
  week int not null,                      -- 1..18 regular season
  home_team text not null,                -- abbreviation, e.g. "KC"
  home_team_name text not null,           -- e.g. "Kansas City Chiefs"
  away_team text not null,
  away_team_name text not null,
  kickoff timestamptz not null,
  home_score int,
  away_score int,
  status text not null default 'scheduled'  -- scheduled | in_progress | final
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null references public.games(id) on delete cascade,
  picked_team text not null,              -- team abbreviation, must match one side of the game
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, game_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever someone signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.games         enable row level security;
alter table public.picks         enable row level security;

-- Profiles: anyone signed in can read (needed for leaderboards);
-- users can only write their own row.
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Groups: readable by any signed-in user (invite codes are meant to be shared).
-- Only the creator value may equal the caller's id on insert.
create policy "groups readable by signed-in users"
  on public.groups for select to authenticated using (true);
create policy "signed-in users can create groups"
  on public.groups for insert to authenticated
  with check (auth.uid() = created_by);

-- Group members: readable by signed-in users; users may only add THEMSELVES
-- (this is how joining via invite code works).
create policy "members readable by signed-in users"
  on public.group_members for select to authenticated using (true);
create policy "users can join groups themselves"
  on public.group_members for insert to authenticated
  with check (auth.uid() = user_id);

-- Games: readable by signed-in users. No insert/update/delete policies for
-- regular users -> only the service role (used by /api/games/ingest and
-- /api/cron/score) can write games.
create policy "games readable by signed-in users"
  on public.games for select to authenticated using (true);

-- Picks: members can read picks in groups they belong to;
-- users can only write their own picks. Kickoff locking is enforced
-- server-side in /api/picks (defense in depth beyond RLS).
create policy "group members can read group picks"
  on public.picks for select to authenticated using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = picks.group_id
        and gm.user_id = auth.uid()
    )
  );
create policy "users insert own picks"
  on public.picks for insert to authenticated
  with check (auth.uid() = user_id);
create policy "users update own picks"
  on public.picks for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "users delete own picks"
  on public.picks for delete to authenticated
  using (auth.uid() = user_id);
