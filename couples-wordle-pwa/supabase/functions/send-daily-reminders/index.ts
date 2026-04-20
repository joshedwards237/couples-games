// Daily Wordle reminder — Web Push via VAPID.
//
// Invoked hourly by pg_cron. Gates on America/Denver local hour == 10 so
// DST shifts are handled in one place (here). Sends a push to every
// opted-in user who has not yet finished today's classic puzzle, with
// per-user randomized copy from a tiered catalog (see pickTemplate).
//
// Secrets live in Supabase Vault → public.get_push_reminder_secrets().

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'https://esm.sh/web-push@3.6.7';

const TARGET_HOUR_DENVER = 10;
const TIMEZONE = 'America/Denver';
const OCCASIONAL_STREAK_RATE = 0.2; // 1-in-5 on non-milestone streak days
const PARTNER_TIER_RATE = 0.8;       // when no T3 hit, 80% T2 / 20% T1

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─────────────────────────────────────────────────────────────────────
// Message catalog — { key, title, body }. Titles/bodies may contain
// {partner}, {streak}, {streak_plus_one}. Keys must be unique and are
// persisted in push_subscriptions.last_message_keys to avoid repeats.
// ─────────────────────────────────────────────────────────────────────
type Template = { key: string; title: string; body: string };

const T3A_PARTNER_FINISHED: Template[] = [
  { key: 't3a_already_solved',  title: '{partner} already solved it 👀', body: 'Your turn. Make it fewer guesses.' },
  { key: 't3a_on_the_board',    title: '{partner} is on the board',       body: 'Time to catch up.' },
  { key: 't3a_played_you_didnt', title: '{partner} played. You didn\u2019t.', body: 'Fix that.' }
];

const T3B_STREAK_30: Template[] = [
  { key: 't3b_crown',   title: 'A {streak}-day streak 👑',      body: 'Protect it. Today\u2019s puzzle is live.' },
  { key: 't3b_ritual',  title: '{streak} days. That\u2019s a ritual.', body: 'Don\u2019t skip today.' }
];

const T3C_STREAK_14: Template[] = [
  { key: 't3c_two_weeks', title: 'Two weeks and counting 🔥',         body: 'Today\u2019s Wordle is the next link.' },
  { key: 't3c_dont_flinch', title: '{streak}-day streak — don\u2019t flinch now', body: 'Puzzle\u2019s up.' }
];

const T3D_STREAK_7: Template[] = [
  { key: 't3d_alive', title: 'Keep your {streak}-day streak alive 🔥', body: 'One more Wordle to make it {streak_plus_one}.' },
  { key: 't3d_line',  title: '{streak}-day streak on the line',         body: 'Don\u2019t drop it today.' }
];

const T2_PARTNER: Template[] = [
  { key: 't2_race',          title: 'Race {partner} to it 🏁',     body: 'Today\u2019s Wordle is live.' },
  { key: 't2_before_coffee', title: 'Beat {partner} before coffee ☕', body: 'Today\u2019s puzzle just dropped.' },
  { key: 't2_not_yet',       title: '{partner} hasn\u2019t played yet', body: 'Get it done first.' },
  { key: 't2_dont_lap',      title: 'Don\u2019t let {partner} lap you', body: 'Today\u2019s Wordle is waiting.' },
  { key: 't2_five_vs',       title: 'Five letters vs. {partner} 💚', body: 'Your daily head-to-head is ready.' }
];

const T1_GENERIC: Template[] = [
  { key: 't1_daily_here',   title: 'Your daily Wordle is here 💚', body: 'Five letters, six tries, good luck.' },
  { key: 't1_hot_off',      title: 'Fresh word, hot off the press 🔥', body: 'Today\u2019s puzzle is ready.' },
  { key: 't1_live_tiles',   title: 'Today\u2019s word is live 🟩🟩🟨', body: 'Tap in.' },
  { key: 't1_brain_called', title: 'Your brain called 🧠',            body: 'It wants today\u2019s Wordle.' },
  { key: 't1_phone_down',   title: 'Put the phone down — after this', body: 'Today\u2019s Wordle takes 90 seconds.' },
  { key: 't1_dont_nag',     title: 'Don\u2019t make us nag 😉',        body: 'Today\u2019s Wordle is still waiting.' },
  { key: 't1_still_thinking', title: 'Still thinking about it?',       body: 'Today\u2019s puzzle won\u2019t solve itself.' }
];

// ─────────────────────────────────────────────────────────────────────
// Secrets & helpers
// ─────────────────────────────────────────────────────────────────────
type VaultSecrets = {
  vapidPublic: string;
  vapidPrivate: string;
  vapidSubject: string;
  cronSecret: string;
};
let cachedSecrets: VaultSecrets | null = null;
let vapidConfigured = false;

async function loadSecrets(client: ReturnType<typeof createClient>): Promise<VaultSecrets> {
  if (cachedSecrets) return cachedSecrets;
  const { data, error } = await client.rpc('get_push_reminder_secrets');
  if (error) throw new Error(`secrets rpc failed: ${error.message}`);
  const obj = (data ?? {}) as Record<string, string>;
  cachedSecrets = {
    vapidPublic: obj.VAPID_PUBLIC_KEY ?? '',
    vapidPrivate: obj.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: obj.VAPID_SUBJECT ?? 'mailto:jedwards@che.school',
    cronSecret: obj.CRON_SECRET ?? ''
  };
  return cachedSecrets;
}

function denverDateParts(): { hour: number; ymd: string } {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      hour12: false
    }).format(now)
  );
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return { hour, ymd };
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function interpolate(str: string, ctx: Record<string, string | number | null>): string {
  return str.replace(/\{(\w+)\}/g, (_m, name) => {
    const v = ctx[name];
    return v == null ? '' : String(v);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Pick engine
// ─────────────────────────────────────────────────────────────────────
type UserContext = {
  partnerName: string | null;       // null if no couple or display_name empty
  partnerFinished: boolean;         // partner finished today's classic (win or loss)
  streakLen: number;                // consecutive winning days ending today or yesterday
  recentKeys: Set<string>;
};

function pickFromPool(pool: Template[], ctx: UserContext): Template | null {
  // First pass: exclude anything seen in the last N sends.
  const fresh = pool.filter((t) => !ctx.recentKeys.has(t.key));
  const choices = fresh.length > 0 ? fresh : pool; // fall through if pool is smaller than history
  if (choices.length === 0) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function pickTemplate(ctx: UserContext): { tier: string; template: Template } | null {
  // 1. Milestone day — highest threshold wins
  if (ctx.streakLen === 30) {
    const t = pickFromPool(T3B_STREAK_30, ctx);
    if (t) return { tier: 't3b_milestone', template: t };
  }
  if (ctx.streakLen === 14) {
    const t = pickFromPool(T3C_STREAK_14, ctx);
    if (t) return { tier: 't3c_milestone', template: t };
  }
  if (ctx.streakLen === 7) {
    const t = pickFromPool(T3D_STREAK_7, ctx);
    if (t) return { tier: 't3d_milestone', template: t };
  }

  // 2. Partner finished today
  if (ctx.partnerFinished && ctx.partnerName) {
    const t = pickFromPool(T3A_PARTNER_FINISHED, ctx);
    if (t) return { tier: 't3a', template: t };
  }

  // 3. Occasional streak ping — highest applicable tier wins
  if (Math.random() < OCCASIONAL_STREAK_RATE) {
    if (ctx.streakLen > 30) {
      const t = pickFromPool(T3B_STREAK_30, ctx);
      if (t) return { tier: 't3b_occasional', template: t };
    } else if (ctx.streakLen > 14) {
      const t = pickFromPool(T3C_STREAK_14, ctx);
      if (t) return { tier: 't3c_occasional', template: t };
    } else if (ctx.streakLen > 7) {
      const t = pickFromPool(T3D_STREAK_7, ctx);
      if (t) return { tier: 't3d_occasional', template: t };
    }
  }

  // 4. Partner-flavored blend (T2 80% / T1 20%)
  if (ctx.partnerName && Math.random() < PARTNER_TIER_RATE) {
    const t = pickFromPool(T2_PARTNER, ctx);
    if (t) return { tier: 't2', template: t };
  }

  // 5. Generic
  const t = pickFromPool(T1_GENERIC, ctx);
  if (t) return { tier: 't1', template: t };
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'missing-supabase-env' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let secrets: VaultSecrets;
  try {
    secrets = await loadSecrets(supabase);
  } catch (err: any) {
    return jsonResponse(500, { error: 'secrets-load-failed', detail: err?.message ?? String(err) });
  }

  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secrets.cronSecret}`;
  if (!secrets.cronSecret || auth !== expected) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  if (!vapidConfigured && secrets.vapidPublic && secrets.vapidPrivate) {
    webpush.setVapidDetails(secrets.vapidSubject, secrets.vapidPublic, secrets.vapidPrivate);
    vapidConfigured = true;
  }
  if (!secrets.vapidPublic || !secrets.vapidPrivate) {
    return jsonResponse(500, { error: 'missing-vapid-secrets' });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const dryRun = url.searchParams.get('dry') === '1';
  const ignoreFinished = url.searchParams.get('ignore_finished') === '1';
  const userEmail = url.searchParams.get('user_email');

  const { hour, ymd } = denverDateParts();
  if (!force && hour !== TARGET_HOUR_DENVER) {
    return jsonResponse(200, { skipped: true, reason: 'not-target-hour', hour, ymd });
  }

  // Admin-test override: target a single user, skip opt-in + finished gate.
  let onlyUserId: string | null = null;
  if (userEmail) {
    const { data: u, error: uErr } = await (supabase as any).auth.admin.listUsers({ page: 1, perPage: 200 });
    if (uErr) return jsonResponse(500, { error: 'user-lookup-failed', detail: uErr.message });
    const match = (u?.users ?? []).find(
      (x: { email?: string | null }) => (x.email ?? '').toLowerCase() === userEmail.toLowerCase()
    );
    if (!match) return jsonResponse(404, { error: 'user-not-found', user_email: userEmail });
    onlyUserId = match.id;
  }

  // Today's classic puzzle id (for finished-today + puzzle-exists check).
  const { data: puzzleRow, error: puzzleErr } = await supabase
    .from('puzzles')
    .select('id')
    .eq('lane', 'classic')
    .eq('date', ymd)
    .maybeSingle();
  if (puzzleErr) return jsonResponse(500, { error: 'puzzle-lookup-failed', detail: puzzleErr.message });
  const todayClassicId: string | null = puzzleRow?.id ?? null;

  // Subscriptions + per-device recent-message history.
  let subsQuery = supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key, last_message_keys');
  if (onlyUserId) subsQuery = subsQuery.eq('user_id', onlyUserId);
  const { data: subs, error: subsErr } = await subsQuery;
  if (subsErr) return jsonResponse(500, { error: 'subs-lookup-failed', detail: subsErr.message });

  const allSubs = (subs ?? []) as Array<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth_key: string;
    last_message_keys: string[] | null;
  }>;

  // Opt-in gate (skipped for admin test).
  let candidates = allSubs;
  if (!onlyUserId) {
    const { data: optedIn, error: profErr } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('notifications_enabled', true);
    if (profErr) return jsonResponse(500, { error: 'profiles-lookup-failed', detail: profErr.message });
    const optedInSet = new Set((optedIn ?? []).map((r: any) => r.user_id as string));
    candidates = allSubs.filter((s) => optedInSet.has(s.user_id));
  }

  // Suppress users who already finished today's classic (skippable).
  let finishedUsers = new Set<string>();
  if (todayClassicId && !ignoreFinished) {
    const { data: finished, error: finishedErr } = await supabase
      .from('puzzle_attempts')
      .select('user_id')
      .eq('puzzle_id', todayClassicId)
      .eq('finished', true);
    if (finishedErr) return jsonResponse(500, { error: 'attempts-lookup-failed', detail: finishedErr.message });
    finishedUsers = new Set((finished ?? []).map((r: any) => r.user_id as string));
  }

  const toNotify = candidates.filter((c) => !finishedUsers.has(c.user_id));

  // ────────────── Build per-user context maps ──────────────
  const userIds = Array.from(new Set(toNotify.map((s) => s.user_id)));

  // Partner map: user_id → { partnerId, partnerName }
  const partnerByUser = new Map<string, { partnerId: string; partnerName: string }>();
  if (userIds.length) {
    const { data: myCouples } = await supabase
      .from('couple_members')
      .select('couple_id, user_id')
      .in('user_id', userIds);
    const coupleIds = Array.from(new Set((myCouples ?? []).map((r: any) => r.couple_id as string)));
    if (coupleIds.length) {
      const { data: allMembers } = await supabase
        .from('couple_members')
        .select('couple_id, user_id')
        .in('couple_id', coupleIds);
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', Array.from(new Set((allMembers ?? []).map((r: any) => r.user_id as string))));
      const nameByUser = new Map<string, string>(
        (allProfiles ?? []).map((p: any) => [p.user_id as string, (p.display_name as string) ?? ''])
      );
      const membersByCouple = new Map<string, string[]>();
      for (const m of (allMembers ?? []) as Array<{ couple_id: string; user_id: string }>) {
        const arr = membersByCouple.get(m.couple_id) ?? [];
        arr.push(m.user_id);
        membersByCouple.set(m.couple_id, arr);
      }
      for (const row of (myCouples ?? []) as Array<{ couple_id: string; user_id: string }>) {
        const members = membersByCouple.get(row.couple_id) ?? [];
        const partnerId = members.find((u) => u !== row.user_id);
        if (!partnerId) continue;
        const rawName = (nameByUser.get(partnerId) ?? '').trim();
        partnerByUser.set(row.user_id, { partnerId, partnerName: rawName });
      }
    }
  }

  // "Partner finished today" map: user_id → bool
  const partnerFinishedByUser = new Map<string, boolean>();
  if (todayClassicId && userIds.length) {
    const partnerIds = Array.from(
      new Set(
        userIds
          .map((u) => partnerByUser.get(u)?.partnerId)
          .filter((v): v is string => !!v)
      )
    );
    if (partnerIds.length) {
      const { data: pf } = await supabase
        .from('puzzle_attempts')
        .select('user_id')
        .eq('puzzle_id', todayClassicId)
        .eq('finished', true)
        .in('user_id', partnerIds);
      const finishedSet = new Set((pf ?? []).map((r: any) => r.user_id as string));
      for (const u of userIds) {
        const pid = partnerByUser.get(u)?.partnerId;
        partnerFinishedByUser.set(u, !!(pid && finishedSet.has(pid)));
      }
    }
  }

  // Streak map: user_id → current consecutive winning days
  const streakByUser = new Map<string, number>();
  if (userIds.length) {
    const windowStart = addDaysYmd(ymd, -60);
    const { data: winRows } = await supabase
      .from('puzzle_attempts')
      .select('user_id, puzzle_id, puzzles!inner(date)')
      .in('user_id', userIds)
      .eq('win', true)
      .eq('finished', true)
      .gte('puzzles.date', windowStart);
    const winDaysByUser = new Map<string, Set<string>>();
    for (const row of (winRows ?? []) as Array<{ user_id: string; puzzles: { date: string } | { date: string }[] }>) {
      const d = Array.isArray(row.puzzles) ? row.puzzles[0]?.date : row.puzzles?.date;
      if (!d) continue;
      const s = winDaysByUser.get(row.user_id) ?? new Set<string>();
      s.add(d);
      winDaysByUser.set(row.user_id, s);
    }
    for (const u of userIds) {
      const wins = winDaysByUser.get(u) ?? new Set<string>();
      // Streak ends today if today is a win; otherwise it may still have
      // ended yesterday (user not yet played today). Walk back from the
      // more lenient endpoint.
      let cursor = wins.has(ymd) ? ymd : addDaysYmd(ymd, -1);
      let len = 0;
      while (wins.has(cursor)) {
        len += 1;
        cursor = addDaysYmd(cursor, -1);
        if (len > 400) break;
      }
      streakByUser.set(u, len);
    }
  }

  // ────────────── Build messages ──────────────
  type Queued = { sub: typeof allSubs[number]; picked: { tier: string; template: Template }; title: string; body: string };
  const queued: Queued[] = [];
  const skipped: Array<{ user_id: string; reason: string }> = [];

  for (const sub of toNotify) {
    const partner = partnerByUser.get(sub.user_id);
    const partnerName = partner?.partnerName && partner.partnerName.length > 0 ? partner.partnerName : null;
    const ctx: UserContext = {
      partnerName,
      partnerFinished: partnerFinishedByUser.get(sub.user_id) ?? false,
      streakLen: streakByUser.get(sub.user_id) ?? 0,
      recentKeys: new Set(sub.last_message_keys ?? [])
    };

    const picked = pickTemplate(ctx);
    if (!picked) {
      skipped.push({ user_id: sub.user_id, reason: 'no-eligible-template' });
      continue;
    }

    const tpl = picked.template;
    const interpCtx = {
      partner: ctx.partnerName ?? 'your partner',
      streak: String(ctx.streakLen),
      streak_plus_one: String(ctx.streakLen + 1)
    };
    const title = interpolate(tpl.title, interpCtx);
    const body = interpolate(tpl.body, interpCtx);
    queued.push({ sub, picked, title, body });
  }

  if (dryRun) {
    return jsonResponse(200, {
      dryRun: true,
      hour,
      ymd,
      only_user_id: onlyUserId,
      today_classic_puzzle_id: todayClassicId,
      total_subscriptions: candidates.length,
      already_finished: finishedUsers.size,
      would_notify: queued.length,
      skipped,
      previews: queued.slice(0, 10).map((q) => ({
        user_id: q.sub.user_id,
        tier: q.picked.tier,
        key: q.picked.template.key,
        title: q.title,
        body: q.body
      }))
    });
  }

  let sent = 0;
  let removed = 0;
  const errors: Array<{ endpoint: string; status?: number; message: string }> = [];

  for (const q of queued) {
    const payload = JSON.stringify({ title: q.title, body: q.body, url: '/' });
    try {
      await webpush.sendNotification(
        { endpoint: q.sub.endpoint, keys: { p256dh: q.sub.p256dh, auth: q.sub.auth_key } },
        payload,
        { TTL: 6 * 60 * 60 }
      );
      sent += 1;
      // Persist most-recent-5 message keys for this device.
      const nextKeys = [q.picked.template.key, ...(q.sub.last_message_keys ?? [])].slice(0, 5);
      await supabase
        .from('push_subscriptions')
        .update({ last_message_keys: nextKeys })
        .eq('id', q.sub.id);
    } catch (err: any) {
      const status = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
      if (status === 404 || status === 410) {
        const { error: delErr } = await supabase.from('push_subscriptions').delete().eq('id', q.sub.id);
        if (!delErr) removed += 1;
      } else {
        errors.push({ endpoint: q.sub.endpoint, status, message: err?.body ?? err?.message ?? String(err) });
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    hour,
    ymd,
    only_user_id: onlyUserId,
    total_subscriptions: candidates.length,
    already_finished: finishedUsers.size,
    attempted: queued.length,
    sent,
    removed_stale: removed,
    errors: errors.slice(0, 10)
  });
});
