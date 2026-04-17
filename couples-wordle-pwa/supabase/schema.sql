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

-- =========================================================================
-- Couples + invitations
-- =========================================================================
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

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

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'couple_members_user_id_unique') then
    alter table public.couple_members add constraint couple_members_user_id_unique unique (user_id);
  end if;
end $$;

alter table public.couple_members enable row level security;

drop policy if exists "couple_members readable by couple" on public.couple_members;
create policy "couple_members readable by couple"
  on public.couple_members for select
  to authenticated
  using (
    user_id = auth.uid() or exists (
      select 1 from public.couple_members cm
      where cm.couple_id = couple_members.couple_id and cm.user_id = auth.uid()
    )
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
