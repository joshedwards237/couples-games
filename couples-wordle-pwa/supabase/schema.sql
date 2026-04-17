-- Couples Wordle — complete schema, RPC, RLS, and word pool seed.
-- Safe to run multiple times (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- =========================================================================
-- Extensions
-- =========================================================================
create extension if not exists "pgcrypto";

-- =========================================================================
-- profiles
-- =========================================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_profiles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.tg_profiles_set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by authenticated" on public.profiles;
create policy "profiles are readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Auto-create a blank profile row on new auth user, and auto-seed the
-- prank admin row for known admin emails so the impostor-badge gate
-- correctly excludes admins even if they sign up AFTER the schema ran.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''))
  on conflict (user_id) do nothing;

  if new.email = any (array['blackbeltjje@gmail.com']) then
    insert into public.prank_admins (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================================
-- word_pool
-- =========================================================================
create table if not exists public.word_pool (
  word text primary key check (char_length(word) = 5 and word = upper(word))
);

alter table public.word_pool enable row level security;

drop policy if exists "word_pool readable by authenticated" on public.word_pool;
create policy "word_pool readable by authenticated"
  on public.word_pool for select
  to authenticated
  using (true);

-- =========================================================================
-- puzzles (additive — tolerates pre-existing table from older setup)
-- =========================================================================
create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  lane text not null check (lane in ('classic', 'couple')),
  word text not null,
  created_at timestamptz not null default now()
);

alter table public.puzzles add column if not exists id uuid primary key default gen_random_uuid();
alter table public.puzzles add column if not exists date date;
alter table public.puzzles add column if not exists lane text;
alter table public.puzzles add column if not exists word text;
alter table public.puzzles add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'puzzles_date_lane_key'
  ) then
    alter table public.puzzles add constraint puzzles_date_lane_key unique (date, lane);
  end if;
end$$;

alter table public.puzzles enable row level security;

drop policy if exists "puzzles readable by authenticated" on public.puzzles;
create policy "puzzles readable by authenticated"
  on public.puzzles for select
  to authenticated
  using (true);

-- =========================================================================
-- puzzle_attempts (additive — tolerates pre-existing table from older setup)
-- =========================================================================
create table if not exists public.puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.puzzle_attempts add column if not exists rows text[] not null default '{}';
alter table public.puzzle_attempts add column if not exists guesses_used int not null default 0;
alter table public.puzzle_attempts add column if not exists time_ms bigint not null default 0;
alter table public.puzzle_attempts add column if not exists hints_used int not null default 0;
alter table public.puzzle_attempts add column if not exists lane text not null default 'classic';
alter table public.puzzle_attempts add column if not exists mode text not null default 'coop';
alter table public.puzzle_attempts add column if not exists win boolean not null default false;
alter table public.puzzle_attempts add column if not exists finished boolean not null default false;
alter table public.puzzle_attempts add column if not exists created_at timestamptz not null default now();
alter table public.puzzle_attempts add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'puzzle_attempts_user_puzzle_key'
  ) then
    alter table public.puzzle_attempts add constraint puzzle_attempts_user_puzzle_key unique (user_id, puzzle_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'puzzle_attempts_lane_check'
  ) then
    alter table public.puzzle_attempts add constraint puzzle_attempts_lane_check check (lane in ('classic', 'couple'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'puzzle_attempts_mode_check'
  ) then
    alter table public.puzzle_attempts add constraint puzzle_attempts_mode_check check (mode in ('coop', 'versus'));
  end if;
end$$;

-- -------------------------------------------------------------------------
-- Reconcile foreign keys on puzzle_attempts. Older versions of this table
-- referenced a legacy public.users and may have multiple FKs to puzzles,
-- which (a) blocks inserts for new auth.users and (b) confuses PostgREST
-- when embedding puzzles via `puzzles!inner(...)`.
-- Drop every existing FK on user_id and on (puzzle_id → puzzles), then add
-- canonical ones pointing at auth.users(id) and public.puzzles(id).
-- -------------------------------------------------------------------------
do $$
declare
  cname text;
begin
  -- Drop every FK on user_id that does NOT target auth.users.
  -- (A legacy FK pointing at public.users often has the default name
  -- 'puzzle_attempts_user_id_fkey', so name-based guards would skip it;
  -- we match on the reference target instead.)
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.puzzle_attempts'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%(user_id)%'
      and confrelid <> 'auth.users'::regclass
  loop
    execute format('alter table public.puzzle_attempts drop constraint %I', cname);
  end loop;

  -- Drop every FK from puzzle_attempts → puzzles except our canonical one,
  -- so PostgREST sees exactly one relationship.
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.puzzle_attempts'::regclass
      and contype = 'f'
      and confrelid = 'public.puzzles'::regclass
      and conname <> 'puzzle_attempts_puzzle_id_fkey'
  loop
    execute format('alter table public.puzzle_attempts drop constraint %I', cname);
  end loop;

  -- Ensure canonical user_id FK → auth.users exists.
  if not exists (
    select 1 from pg_constraint
    where conname = 'puzzle_attempts_user_id_fkey'
      and conrelid = 'public.puzzle_attempts'::regclass
      and confrelid = 'auth.users'::regclass
  ) then
    alter table public.puzzle_attempts
      add constraint puzzle_attempts_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  -- Ensure canonical puzzle_id FK → public.puzzles exists.
  if not exists (
    select 1 from pg_constraint
    where conname = 'puzzle_attempts_puzzle_id_fkey'
      and conrelid = 'public.puzzle_attempts'::regclass
      and confrelid = 'public.puzzles'::regclass
  ) then
    alter table public.puzzle_attempts
      add constraint puzzle_attempts_puzzle_id_fkey
      foreign key (puzzle_id) references public.puzzles(id) on delete cascade;
  end if;
end$$;

create index if not exists puzzle_attempts_puzzle_idx on public.puzzle_attempts (puzzle_id);
create index if not exists puzzle_attempts_user_idx on public.puzzle_attempts (user_id, created_at desc);

create or replace function public.tg_attempts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attempts_set_updated_at on public.puzzle_attempts;
create trigger attempts_set_updated_at
before update on public.puzzle_attempts
for each row execute function public.tg_attempts_set_updated_at();

alter table public.puzzle_attempts enable row level security;

-- Authed users can read all finished attempts (for leaderboard); own attempts always.
drop policy if exists "attempts read finished or own" on public.puzzle_attempts;
create policy "attempts read finished or own"
  on public.puzzle_attempts for select
  to authenticated
  using (finished = true or user_id = auth.uid());

drop policy if exists "users insert own attempts" on public.puzzle_attempts;
create policy "users insert own attempts"
  on public.puzzle_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users update own attempts" on public.puzzle_attempts;
create policy "users update own attempts"
  on public.puzzle_attempts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- RPC: get_daily_puzzle(lane)
-- Idempotent: returns today's puzzle for a lane, creating it if missing.
-- Word is selected deterministically from word_pool seeded on date+lane,
-- so any concurrent client that inserts first wins; everyone sees the same row.
-- =========================================================================
create or replace function public.get_daily_puzzle(p_lane text)
returns public.puzzles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_existing public.puzzles;
  v_word text;
  v_seed text;
begin
  if p_lane not in ('classic', 'couple') then
    raise exception 'invalid lane %', p_lane;
  end if;

  select * into v_existing from public.puzzles where date = v_today and lane = p_lane;
  if found then
    return v_existing;
  end if;

  v_seed := v_today::text || ':' || p_lane;
  select word into v_word
  from public.word_pool
  order by md5(v_seed || word)
  limit 1;

  if v_word is null then
    raise exception 'word_pool is empty';
  end if;

  insert into public.puzzles (date, lane, word)
  values (v_today, p_lane, v_word)
  on conflict (date, lane) do nothing
  returning * into v_existing;

  if v_existing.id is null then
    select * into v_existing from public.puzzles where date = v_today and lane = p_lane;
  end if;

  return v_existing;
end;
$$;

grant execute on function public.get_daily_puzzle(text) to authenticated;

-- =========================================================================
-- Word pool seed (common 5-letter words). Idempotent via ON CONFLICT.
-- =========================================================================
insert into public.word_pool (word) values
('ABOUT'),('ABOVE'),('ABUSE'),('ACTOR'),('ACUTE'),('ADMIT'),('ADOPT'),('ADULT'),('AFTER'),('AGAIN'),
('AGENT'),('AGREE'),('AHEAD'),('ALARM'),('ALBUM'),('ALERT'),('ALIEN'),('ALIGN'),('ALIKE'),('ALIVE'),
('ALLOW'),('ALONE'),('ALONG'),('ALTER'),('AMONG'),('ANGER'),('ANGLE'),('ANGRY'),('APART'),('APPLE'),
('APPLY'),('ARENA'),('ARGUE'),('ARISE'),('ARRAY'),('ASIDE'),('ASSET'),('AUDIO'),('AUDIT'),('AVOID'),
('AWAKE'),('AWARD'),('AWARE'),('BADLY'),('BAKER'),('BASES'),('BASIC'),('BEACH'),('BEGAN'),('BEGIN'),
('BEING'),('BELOW'),('BENCH'),('BILLY'),('BIRTH'),('BLACK'),('BLAME'),('BLIND'),('BLOCK'),('BLOOD'),
('BOARD'),('BOOST'),('BOOTH'),('BOUND'),('BRAIN'),('BRAND'),('BRAVE'),('BREAD'),('BREAK'),('BREED'),
('BRIEF'),('BRING'),('BROAD'),('BROKE'),('BROWN'),('BUILD'),('BUILT'),('BUYER'),('CABLE'),('CALIF'),
('CARRY'),('CATCH'),('CAUSE'),('CHAIN'),('CHAIR'),('CHART'),('CHASE'),('CHEAP'),('CHECK'),('CHEST'),
('CHIEF'),('CHILD'),('CHINA'),('CHOSE'),('CIVIL'),('CLAIM'),('CLASS'),('CLEAN'),('CLEAR'),('CLICK'),
('CLIMB'),('CLOCK'),('CLOSE'),('COACH'),('COAST'),('COULD'),('COUNT'),('COURT'),('COVER'),('CRAFT'),
('CRASH'),('CREAM'),('CRIME'),('CROSS'),('CROWD'),('CROWN'),('CURVE'),('CYCLE'),('DAILY'),('DANCE'),
('DATED'),('DEALT'),('DEATH'),('DEBUT'),('DELAY'),('DEPTH'),('DOING'),('DOUBT'),('DOZEN'),('DRAFT'),
('DRAMA'),('DRAWN'),('DREAM'),('DRESS'),('DRILL'),('DRINK'),('DRIVE'),('DROVE'),('DYING'),('EAGER'),
('EARLY'),('EARTH'),('EIGHT'),('ELITE'),('EMPTY'),('ENEMY'),('ENJOY'),('ENTER'),('ENTRY'),('EQUAL'),
('ERROR'),('EVENT'),('EVERY'),('EXACT'),('EXIST'),('EXTRA'),('FAITH'),('FALSE'),('FAULT'),('FIBER'),
('FIELD'),('FIFTH'),('FIFTY'),('FIGHT'),('FINAL'),('FIRST'),('FIXED'),('FLASH'),('FLEET'),('FLOOR'),
('FLUID'),('FOCUS'),('FORCE'),('FORTH'),('FORTY'),('FORUM'),('FOUND'),('FRAME'),('FRANK'),('FRAUD'),
('FRESH'),('FRONT'),('FRUIT'),('FULLY'),('FUNNY'),('GIANT'),('GIVEN'),('GLASS'),('GLOBE'),('GOING'),
('GRACE'),('GRADE'),('GRAND'),('GRANT'),('GRASS'),('GREAT'),('GREEN'),('GROSS'),('GROUP'),('GROWN'),
('GUARD'),('GUESS'),('GUEST'),('GUIDE'),('HAPPY'),('HARRY'),('HEART'),('HEAVY'),('HENCE'),('HENRY'),
('HORSE'),('HOTEL'),('HOUSE'),('HUMAN'),('IDEAL'),('IMAGE'),('INDEX'),('INNER'),('INPUT'),('ISSUE'),
('JAPAN'),('JIMMY'),('JOINT'),('JONES'),('JUDGE'),('KNOWN'),('LABEL'),('LARGE'),('LASER'),('LATER'),
('LAUGH'),('LAYER'),('LEARN'),('LEASE'),('LEAST'),('LEAVE'),('LEGAL'),('LEVEL'),('LEWIS'),('LIGHT'),
('LIMIT'),('LINKS'),('LIVES'),('LOCAL'),('LOGIC'),('LOOSE'),('LOWER'),('LUCKY'),('LUNCH'),('LYING'),
('MAGIC'),('MAJOR'),('MAKER'),('MARCH'),('MARIA'),('MATCH'),('MAYBE'),('MAYOR'),('MEANT'),('MEDIA'),
('METAL'),('MIGHT'),('MINOR'),('MINUS'),('MIXED'),('MODEL'),('MONEY'),('MONTH'),('MORAL'),('MOTOR'),
('MOUNT'),('MOUSE'),('MOUTH'),('MOVED'),('MOVIE'),('MUSIC'),('NEEDS'),('NEVER'),('NEWLY'),('NIGHT'),
('NOISE'),('NORTH'),('NOTED'),('NOVEL'),('NURSE'),('OCCUR'),('OCEAN'),('OFFER'),('OFTEN'),('ORDER'),
('OTHER'),('OUGHT'),('PAINT'),('PANEL'),('PAPER'),('PARTY'),('PEACE'),('PETER'),('PHASE'),('PHONE'),
('PHOTO'),('PIANO'),('PIECE'),('PILOT'),('PITCH'),('PLACE'),('PLAIN'),('PLANE'),('PLANT'),('PLATE'),
('POINT'),('POUND'),('POWER'),('PRESS'),('PRICE'),('PRIDE'),('PRIME'),('PRINT'),('PRIOR'),('PRIZE'),
('PROOF'),('PROUD'),('PROVE'),('QUEEN'),('QUICK'),('QUIET'),('QUITE'),('RADIO'),('RAISE'),('RANGE'),
('RAPID'),('RATIO'),('REACH'),('READY'),('REFER'),('RIGHT'),('RIVAL'),('RIVER'),('ROBIN'),('ROMAN'),
('ROUGH'),('ROUND'),('ROUTE'),('ROYAL'),('RURAL'),('SCALE'),('SCENE'),('SCOPE'),('SCORE'),('SENSE'),
('SERVE'),('SEVEN'),('SHALL'),('SHAPE'),('SHARE'),('SHARP'),('SHEET'),('SHELF'),('SHELL'),('SHIFT'),
('SHIRT'),('SHOCK'),('SHOOT'),('SHORT'),('SHOWN'),('SIGHT'),('SILLY'),('SINCE'),('SIXTH'),('SIXTY'),
('SIZED'),('SKILL'),('SLEEP'),('SLIDE'),('SMALL'),('SMART'),('SMILE'),('SMOKE'),('SNAKE'),('SNOWY'),
('SOLID'),('SOLVE'),('SORRY'),('SOUND'),('SOUTH'),('SPACE'),('SPARE'),('SPEAK'),('SPEED'),('SPEND'),
('SPENT'),('SPLIT'),('SPOKE'),('SPORT'),('STAFF'),('STAGE'),('STAKE'),('STAND'),('START'),('STATE'),
('STEAM'),('STEEL'),('STICK'),('STILL'),('STOCK'),('STONE'),('STOOD'),('STORE'),('STORM'),('STORY'),
('STRIP'),('STUCK'),('STUDY'),('STUFF'),('STYLE'),('SUGAR'),('SUITE'),('SUPER'),('SWEET'),('TABLE'),
('TAKEN'),('TASTE'),('TAXES'),('TEACH'),('TEETH'),('TERRY'),('THANK'),('THEFT'),('THEIR'),('THEME'),
('THERE'),('THESE'),('THICK'),('THING'),('THINK'),('THIRD'),('THOSE'),('THREE'),('THREW'),('THROW'),
('TIGHT'),('TIMES'),('TIRED'),('TITLE'),('TODAY'),('TOPIC'),('TOTAL'),('TOUCH'),('TOUGH'),('TOWER'),
('TRACK'),('TRADE'),('TRAIN'),('TREAT'),('TREND'),('TRIAL'),('TRIED'),('TRIES'),('TRUCK'),('TRULY'),
('TRUST'),('TRUTH'),('TWICE'),('UNDER'),('UNDUE'),('UNION'),('UNITY'),('UNTIL'),('UPPER'),('UPSET'),
('URBAN'),('USAGE'),('USUAL'),('VALID'),('VALUE'),('VIDEO'),('VIRUS'),('VISIT'),('VITAL'),('VOICE'),
('WASTE'),('WATCH'),('WATER'),('WHEEL'),('WHERE'),('WHICH'),('WHILE'),('WHITE'),('WHOLE'),('WHOSE'),
('WOMAN'),('WOMEN'),('WORLD'),('WORRY'),('WORSE'),('WORST'),('WORTH'),('WOULD'),('WOUND'),('WRITE'),
('WRONG'),('WROTE'),('YIELD'),('YOUNG'),('YOUTH'),('ZEBRA'),('ZESTY')
on conflict (word) do nothing;

-- =========================================================================
-- Couples + invitations
-- =========================================================================
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Additive columns in case an older version of this table predates them.
alter table public.couples add column if not exists name text;
alter table public.couples add column if not exists created_by uuid references auth.users(id) on delete cascade;
alter table public.couples add column if not exists created_at timestamptz not null default now();

do $$
begin
  -- Back-fill any rows that predate created_by (shouldn't exist, but belt-and-braces).
  -- If a row has no creator we can't invent one safely; leave it null and let the
  -- NOT NULL tighten below fail loudly if orphaned rows exist.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'couples'
      and column_name = 'created_by' and is_nullable = 'YES'
  ) then
    -- Only add the NOT NULL constraint if every existing row has a value.
    if not exists (select 1 from public.couples where created_by is null) then
      alter table public.couples alter column created_by set not null;
    end if;
  end if;
end$$;

alter table public.couples enable row level security;

drop policy if exists "couples readable by members" on public.couples;
create policy "couples readable by members"
  on public.couples for select
  to authenticated
  using (
    exists (
      select 1 from public.couple_members cm
      where cm.couple_id = couples.id and cm.user_id = auth.uid()
    )
  );

-- couple_members: unique(user_id) so a user can only be in one couple.
create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- Additive columns for legacy tables that predate the current shape.
alter table public.couple_members add column if not exists couple_id uuid;
alter table public.couple_members add column if not exists user_id uuid;
alter table public.couple_members add column if not exists role text not null default 'member';
alter table public.couple_members add column if not exists joined_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'couple_members_user_id_unique') then
    alter table public.couple_members add constraint couple_members_user_id_unique unique (user_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'couple_members_role_check'
  ) then
    alter table public.couple_members
      add constraint couple_members_role_check check (role in ('creator', 'member'));
  end if;
end $$;

-- Reconcile legacy FK: older versions referenced a non-existent public.users
-- table. Drop any user_id FK that doesn't target auth.users, then ensure the
-- canonical one exists.
do $$
declare
  cname text;
begin
  for cname in
    select conname from pg_constraint
     where conrelid = 'public.couple_members'::regclass
       and contype = 'f'
       and pg_get_constraintdef(oid) ilike '%(user_id)%'
       and confrelid <> 'auth.users'::regclass
  loop
    execute format('alter table public.couple_members drop constraint %I', cname);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.couple_members'::regclass
       and contype = 'f'
       and pg_get_constraintdef(oid) ilike '%(user_id)%'
       and confrelid = 'auth.users'::regclass
  ) then
    alter table public.couple_members
      add constraint couple_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end$$;

alter table public.couple_members enable row level security;

-- SELECT policy membership check. Wrapped in a SECURITY DEFINER function
-- so the inner `select ... from couple_members` bypasses RLS — otherwise
-- Postgres re-enters the same policy and raises "infinite recursion
-- detected in policy for relation couple_members".
create or replace function public.is_member_of_couple(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = c_id and user_id = auth.uid()
  )
$$;

grant execute on function public.is_member_of_couple(uuid) to authenticated;

drop policy if exists "couple_members readable by couple" on public.couple_members;
create policy "couple_members readable by couple"
  on public.couple_members for select
  to authenticated
  using (
    user_id = auth.uid() or public.is_member_of_couple(couple_id)
  );

drop policy if exists "couple_members delete own" on public.couple_members;
create policy "couple_members delete own"
  on public.couple_members for delete
  to authenticated
  using (user_id = auth.uid());

-- RPC: create a new couple, auto-enroll creator. Rejects if already in a couple.
create or replace function public.create_couple(p_name text default null)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple public.couples;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.couple_members where user_id = v_user_id) then
    raise exception 'already in a couple';
  end if;
  insert into public.couples (name, created_by)
  values (nullif(trim(p_name), ''), v_user_id)
  returning * into v_couple;
  insert into public.couple_members (couple_id, user_id, role)
  values (v_couple.id, v_user_id, 'creator');
  return v_couple;
end;
$$;

grant execute on function public.create_couple(text) to authenticated;

-- RPC: join an existing couple by id. Idempotent for own membership.
create or replace function public.join_couple(p_couple_id uuid)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple public.couples;
  v_member_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  select * into v_couple from public.couples where id = p_couple_id;
  if v_couple.id is null then raise exception 'couple not found'; end if;

  if exists (
    select 1 from public.couple_members
    where couple_id = v_couple.id and user_id = v_user_id
  ) then
    return v_couple;
  end if;

  if exists (select 1 from public.couple_members where user_id = v_user_id) then
    raise exception 'already in a different couple';
  end if;

  select count(*)::int into v_member_count
  from public.couple_members where couple_id = v_couple.id;
  if v_member_count >= 2 then raise exception 'couple is full'; end if;

  insert into public.couple_members (couple_id, user_id, role)
  values (v_couple.id, v_user_id, 'member');
  return v_couple;
end;
$$;

grant execute on function public.join_couple(uuid) to authenticated;

-- RPC: leave the current couple. Deletes couple when last member leaves.
create or replace function public.leave_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
  v_remaining int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  select couple_id into v_couple_id from public.couple_members where user_id = v_user_id;
  if v_couple_id is null then return; end if;
  delete from public.couple_members where user_id = v_user_id;
  select count(*)::int into v_remaining from public.couple_members where couple_id = v_couple_id;
  if v_remaining = 0 then
    delete from public.couples where id = v_couple_id;
  end if;
end;
$$;

grant execute on function public.leave_couple() to authenticated;

-- RPC: couple preview (safe for pre-signin invite landing pages).
-- Exposes only creator's display_name + whether the couple has capacity.
create or replace function public.get_couple_preview(p_couple_id uuid)
returns table (id uuid, creator_display_name text, member_count int, is_full boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
  select
    c.id,
    coalesce(p.display_name, '') as creator_display_name,
    (select count(*)::int from public.couple_members where couple_id = c.id) as member_count,
    (select count(*) from public.couple_members where couple_id = c.id) >= 2 as is_full
  from public.couples c
  left join public.profiles p on p.user_id = c.created_by
  where c.id = p_couple_id;
end;
$$;

grant execute on function public.get_couple_preview(uuid) to anon, authenticated;

-- =========================================================================
-- Prank system — admin-only dashboard at /prank controls per-prank
-- config, probability, thresholds, and per-user exemptions. All tables are
-- readable by authenticated users (client needs settings to decide whether
-- to fire); writes are admin-only via the is_prank_admin() helper.
-- =========================================================================

create table if not exists public.prank_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.prank_admins enable row level security;
alter table public.prank_admins force row level security;
revoke all on public.prank_admins from public, anon;
grant select on public.prank_admins to authenticated;

drop policy if exists "prank_admins readable by authenticated" on public.prank_admins;
create policy "prank_admins readable by authenticated"
  on public.prank_admins for select
  to authenticated
  using (true);

create or replace function public.is_prank_admin(u uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.prank_admins where user_id = u) $$;

grant execute on function public.is_prank_admin(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- prank_config — one row per prank_key. Admin dashboard is the only writer.
-- -------------------------------------------------------------------------
create table if not exists public.prank_config (
  prank_key           text primary key,
  enabled             boolean not null default false,
  probability         numeric not null default 1 check (probability >= 0 and probability <= 1),
  trigger_max_guesses int not null default 2 check (trigger_max_guesses between 1 and 6),
  fire_same_session   boolean not null default false,
  fire_next_day       boolean not null default true,
  updated_at          timestamptz not null default now()
);

create or replace function public.tg_prank_config_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prank_config_set_updated_at on public.prank_config;
create trigger prank_config_set_updated_at
before update on public.prank_config
for each row execute function public.tg_prank_config_set_updated_at();

alter table public.prank_config enable row level security;
alter table public.prank_config force row level security;
revoke all on public.prank_config from public, anon;
grant select on public.prank_config to authenticated;
grant insert, update, delete on public.prank_config to authenticated; -- RLS policy still gates actual writes to admins

drop policy if exists "prank_config readable by authenticated" on public.prank_config;
create policy "prank_config readable by authenticated"
  on public.prank_config for select
  to authenticated
  using (true);

drop policy if exists "prank_config writable by admins" on public.prank_config;
create policy "prank_config writable by admins"
  on public.prank_config for all
  to authenticated
  using (public.is_prank_admin(auth.uid()))
  with check (public.is_prank_admin(auth.uid()));

-- -------------------------------------------------------------------------
-- prank_exemptions — users who are never targeted by a given prank.
-- -------------------------------------------------------------------------
create table if not exists public.prank_exemptions (
  user_id   uuid not null references auth.users(id) on delete cascade,
  prank_key text not null references public.prank_config(prank_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, prank_key)
);

alter table public.prank_exemptions enable row level security;
alter table public.prank_exemptions force row level security;
revoke all on public.prank_exemptions from public, anon;
grant select on public.prank_exemptions to authenticated;
grant insert, update, delete on public.prank_exemptions to authenticated;

drop policy if exists "prank_exemptions readable by authenticated" on public.prank_exemptions;
create policy "prank_exemptions readable by authenticated"
  on public.prank_exemptions for select
  to authenticated
  using (true);

drop policy if exists "prank_exemptions writable by admins" on public.prank_exemptions;
create policy "prank_exemptions writable by admins"
  on public.prank_exemptions for all
  to authenticated
  using (public.is_prank_admin(auth.uid()))
  with check (public.is_prank_admin(auth.uid()));

-- -------------------------------------------------------------------------
-- Seed all known prank keys. Idempotent via ON CONFLICT DO NOTHING, so
-- existing tuned rows keep their values across re-runs.
-- -------------------------------------------------------------------------
insert into public.prank_config (prank_key, fire_same_session, fire_next_day) values
  -- instant (timing flags ignored for this category, default false/true is fine)
  ('moving_enter',          false, false),
  ('wrong_answer_reveal',   false, false),
  ('impostor_badge',        false, false),
  -- slow-burn
  ('autocorrect_sabotage',  false, true),
  ('reverse_keystrokes',    false, true),
  ('tile_rebellion',        false, true),
  -- narrative
  ('partner_reaction',      false, false),
  ('tiles_spell_message',   false, false),
  ('suspicious_activity',   false, false),
  ('reveal_rewrite',        false, false),
  ('false_positive',        false, false),
  ('instant_dm',            false, false),
  ('sudden_dark_mode',      false, false),
  ('retractable_score',     false, false)
on conflict (prank_key) do nothing;

-- Bootstrap the primary admin. Runs only if the user has signed in at
-- least once (the auth.users row exists); otherwise silently no-ops.
insert into public.prank_admins (user_id)
select id from auth.users where email = 'blackbeltjje@gmail.com'
on conflict (user_id) do nothing;

-- =========================================================================
-- Trophies
-- =========================================================================
create table if not exists public.trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  puzzle_id uuid references public.puzzles(id) on delete cascade,
  streak_length int,
  earned_at timestamptz not null default now(),
  metadata jsonb
);

create index if not exists trophies_user_earned_idx on public.trophies (user_id, earned_at desc);
create index if not exists trophies_puzzle_idx on public.trophies (puzzle_id) where puzzle_id is not null;

-- Partial unique indexes: one per-puzzle trophy per (user, kind, puzzle);
-- one streak-length trophy per (user, kind, streak_length).
create unique index if not exists trophies_per_puzzle_unique
  on public.trophies (user_id, kind, puzzle_id)
  where puzzle_id is not null;
create unique index if not exists trophies_streak_unique
  on public.trophies (user_id, kind, streak_length)
  where streak_length is not null;

alter table public.trophies enable row level security;

drop policy if exists "trophies readable by authenticated" on public.trophies;
create policy "trophies readable by authenticated"
  on public.trophies for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies: clients can't write directly.
-- All writes flow through award_trophies_for_attempt (security definer)
-- triggered automatically on puzzle_attempts insert/update.

-- -------------------------------------------------------------------------
-- Awarding function: called from a trigger after a win is saved.
-- Idempotent via ON CONFLICT DO NOTHING on the partial unique indexes.
-- -------------------------------------------------------------------------
create or replace function public.award_trophies_for_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt record;
  v_date date;
  v_streak int := 0;
  v_cursor date;
  v_has_win boolean;
begin
  select pa.user_id, pa.puzzle_id, pa.win, pa.finished, pa.guesses_used,
         p.date as puzzle_date
  into v_attempt
  from public.puzzle_attempts pa
  join public.puzzles p on p.id = pa.puzzle_id
  where pa.id = p_attempt_id;

  if not found then return; end if;
  if not v_attempt.finished or not v_attempt.win then return; end if;
  v_date := v_attempt.puzzle_date;

  insert into public.trophies (user_id, kind, tier, puzzle_id)
  values (v_attempt.user_id, 'win', 'bronze', v_attempt.puzzle_id)
  on conflict do nothing;

  if v_attempt.guesses_used <= 3 then
    insert into public.trophies (user_id, kind, tier, puzzle_id)
    values (v_attempt.user_id, 'sub_3', 'silver', v_attempt.puzzle_id)
    on conflict do nothing;
  end if;

  if v_attempt.guesses_used = 1 then
    insert into public.trophies (user_id, kind, tier, puzzle_id)
    values (v_attempt.user_id, 'perfect', 'gold', v_attempt.puzzle_id)
    on conflict do nothing;
  end if;

  -- Walk backwards from this puzzle's date counting consecutive winning days.
  v_cursor := v_date;
  loop
    select exists (
      select 1
      from public.puzzle_attempts pa
      join public.puzzles p on p.id = pa.puzzle_id
      where pa.user_id = v_attempt.user_id
        and pa.win = true
        and pa.finished = true
        and p.date = v_cursor
    ) into v_has_win;
    if not v_has_win then exit; end if;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  if v_streak >= 7 then
    insert into public.trophies (user_id, kind, tier, streak_length)
    values (v_attempt.user_id, 'streak_7', 'bronze', 7)
    on conflict do nothing;
  end if;
  if v_streak >= 14 then
    insert into public.trophies (user_id, kind, tier, streak_length)
    values (v_attempt.user_id, 'streak_14', 'silver', 14)
    on conflict do nothing;
  end if;
  if v_streak >= 30 then
    insert into public.trophies (user_id, kind, tier, streak_length)
    values (v_attempt.user_id, 'streak_30', 'gold', 30)
    on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.award_trophies_for_attempt(uuid) to authenticated;

create or replace function public.tg_puzzle_attempts_award_trophies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.finished = true and new.win = true then
    perform public.award_trophies_for_attempt(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists puzzle_attempts_award_trophies on public.puzzle_attempts;
create trigger puzzle_attempts_award_trophies
after insert or update of finished, win on public.puzzle_attempts
for each row execute function public.tg_puzzle_attempts_award_trophies();

-- -------------------------------------------------------------------------
-- One-shot backfill for existing winning attempts. Idempotent.
-- Ordered by puzzle date so streak computation is correct row-by-row.
-- -------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select pa.id
    from public.puzzle_attempts pa
    join public.puzzles p on p.id = pa.puzzle_id
    where pa.finished = true and pa.win = true
    order by p.date asc, pa.created_at asc
  loop
    perform public.award_trophies_for_attempt(r.id);
  end loop;
end$$;

-- =========================================================================
-- Display name backfill
-- -------------------------------------------------------------------------
-- Older profile rows may have display_name = '' if they were created before
-- the handle_new_user trigger, or for magic-link signups where no full_name
-- was in the OAuth metadata. For any blank profile, pull the best available
-- name from auth.users.raw_user_meta_data, then fall back to the email
-- prefix.
-- =========================================================================
update public.profiles p
set display_name = coalesce(
  nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
  nullif(trim(u.raw_user_meta_data->>'name'), ''),
  split_part(u.email, '@', 1),
  ''
)
from auth.users u
where u.id = p.user_id
  and (p.display_name is null or btrim(p.display_name) = '')
  and coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''),
        split_part(u.email, '@', 1),
        ''
      ) <> '';

-- Keep profile names in sync when Google refreshes the OAuth metadata
-- AFTER signup (e.g., a user updates their Google display name). Only
-- overwrites when the profile's current name is blank; an explicit user
-- edit via Profile > "Display name" is preserved.
create or replace function public.tg_sync_display_name_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_best text;
begin
  if new.raw_user_meta_data is null then return new; end if;
  v_best := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1),
    ''
  );
  if v_best = '' then return new; end if;

  update public.profiles
  set display_name = v_best
  where user_id = new.id
    and (display_name is null or btrim(display_name) = '');
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_update on auth.users;
create trigger on_auth_user_metadata_update
after update of raw_user_meta_data, email on auth.users
for each row execute function public.tg_sync_display_name_from_auth();

-- =========================================================================
-- Avatar URL on profiles + sync from auth.users OAuth metadata
-- -------------------------------------------------------------------------
-- Leaderboard + UserMenu want to show the Google profile picture next to
-- each player. Store it on profiles so we don't have to reach into every
-- user's auth metadata (which would require an RPC per read).
-- =========================================================================
alter table public.profiles add column if not exists avatar_url text;

-- One-shot backfill: pull avatar_url from raw_user_meta_data (Google OAuth)
-- or `picture` (older Supabase shape). Idempotent — only updates blank rows.
update public.profiles p
set avatar_url = coalesce(
  nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
  nullif(trim(u.raw_user_meta_data->>'picture'), '')
)
from auth.users u
where u.id = p.user_id
  and (p.avatar_url is null or p.avatar_url = '')
  and coalesce(
        nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
        nullif(trim(u.raw_user_meta_data->>'picture'), '')
      ) is not null;

-- Extend the new-user trigger to also seed avatar_url. Keeps the existing
-- admin-bootstrap branch.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data->>'picture'), '')
    )
  )
  on conflict (user_id) do nothing;

  if new.email = any (array['blackbeltjje@gmail.com']) then
    insert into public.prank_admins (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Extend the metadata-update trigger to sync avatar_url too. We DO always
-- overwrite avatar_url from Google (unlike display_name which we only fill
-- when blank) because the Google avatar is canonical and refreshes over
-- time; users don't pick their own avatar in this app.
create or replace function public.tg_sync_display_name_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_best text;
  v_avatar text;
begin
  if new.raw_user_meta_data is null then return new; end if;
  v_best := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1),
    ''
  );
  v_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'picture'), '')
  );

  update public.profiles
  set
    display_name = case
      when display_name is null or btrim(display_name) = '' then v_best
      else display_name
    end,
    avatar_url = coalesce(v_avatar, avatar_url)
  where user_id = new.id;
  return new;
end;
$$;
