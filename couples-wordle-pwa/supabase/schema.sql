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

-- Auto-create a blank profile row on new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''))
  on conflict (user_id) do nothing;
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
