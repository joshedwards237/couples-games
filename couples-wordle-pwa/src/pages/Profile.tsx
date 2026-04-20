import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { StreakCard } from '@/components/StreakCard';
import { CoupleCard } from '@/components/CoupleCard';
import { TrophyShelf } from '@/components/TrophyShelf';
import { useAuth } from '@/context/AuthContext';
import { fetchGameHistory, fetchUserStats } from '@/lib/stats';
import { fetchMyTrophyStats } from '@/lib/trophies';
import { getProfile, setNotificationsEnabled, upsertDisplayName } from '@/lib/profiles';
import {
  getExistingSubscription,
  isIosStandalone,
  isPushSupported,
  pushPermission,
  subscribeToPush,
  unsubscribeFromPush
} from '@/lib/push';
import { usePranks } from '@/context/PrankContext';
import type { GameHistoryEntry, TrophyStats, UserStats } from '@/lib/types';

export function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = usePranks();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [trophyStats, setTrophyStats] = useState<TrophyStats | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifPref, setNotifPref] = useState<boolean>(true);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const profile = await getProfile(user.id);
        let effectiveName = profile?.displayName ?? '';

        // Self-heal: if the stored display_name is blank but the user has
        // a Google (or other OAuth) full_name in their auth metadata,
        // persist it so the leaderboard stops calling us "Player".
        if (!effectiveName.trim()) {
          const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
          const fromMeta =
            (typeof meta.full_name === 'string' ? meta.full_name : '') ||
            (typeof meta.name === 'string' ? meta.name : '') ||
            (user.email ? user.email.split('@')[0] : '');
          const trimmed = fromMeta.trim();
          if (trimmed) {
            try {
              const saved = await upsertDisplayName(user.id, trimmed);
              effectiveName = saved.displayName;
            } catch (e) {
              console.error('display_name self-heal failed', e);
              effectiveName = trimmed;
            }
          }
        }
        if (!cancelled) {
          setDisplayName(effectiveName);
          setNotifPref(profile?.notificationsEnabled ?? true);
        }

        // Reflect whether *this device* already has an active push
        // subscription — separate from the DB-level notifications_enabled
        // preference (which is account-wide).
        try {
          const sub = await getExistingSubscription();
          if (!cancelled) setPushSubscribed(!!sub);
        } catch (_err) {
          /* noop — harmless */
        }

        const [userStats, userHistory, userTrophyStats] = await Promise.all([
          fetchUserStats(user.id),
          fetchGameHistory(user.id, 30),
          fetchMyTrophyStats(user.id)
        ]);
        if (cancelled) return;
        setStats(userStats);
        setHistory(userHistory);
        setTrophyStats(userTrophyStats);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message ?? 'Failed to load profile');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggleNotifications = async (next: boolean) => {
    if (!user) return;
    setNotifBusy(true);
    setNotifError(null);
    try {
      if (next) {
        if (!isPushSupported()) {
          throw new Error('This browser does not support push notifications.');
        }
        if (!isIosStandalone()) {
          throw new Error('On iPhone, add this app to your Home Screen first, then open it from that icon and try again.');
        }
        await subscribeToPush(user.id);
        await setNotificationsEnabled(user.id, true);
        setPushSubscribed(true);
        setNotifPref(true);
      } else {
        await unsubscribeFromPush();
        await setNotificationsEnabled(user.id, false);
        setPushSubscribed(false);
        setNotifPref(false);
      }
    } catch (e: any) {
      console.error(e);
      setNotifError(e?.message ?? 'Could not update notifications.');
    } finally {
      setNotifBusy(false);
    }
  };

  const saveName = async () => {
    if (!user) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      await upsertDisplayName(user.id, displayName);
      setNameSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold">Profile</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                Admin
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        <IdentityCard />

        <Card className="space-y-2 bg-white/80 backdrop-blur">
          <p className="text-sm text-textSecondary">Display name</p>
          <div className="flex gap-2">
            <Input
              placeholder="What should we call you?"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameSaved(false);
              }}
              maxLength={40}
            />
            <Button onClick={saveName} disabled={savingName || !displayName.trim()}>
              {savingName ? 'Saving…' : nameSaved ? 'Saved' : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-textSecondary">
            Shown on the leaderboard. Signed in as {user?.email ?? user?.id}.
          </p>
        </Card>

        <NotificationsCard
          enabled={notifPref && pushSubscribed}
          busy={notifBusy}
          error={notifError}
          supported={isPushSupported()}
          permission={pushPermission()}
          iosOk={isIosStandalone()}
          onToggle={handleToggleNotifications}
        />

        <UpdatesCard />

        <StreakCard
          currentStreak={stats?.currentStreak ?? null}
          maxStreak={stats?.maxStreak ?? null}
          totalWins={stats?.totalWins ?? null}
          trophyCount={trophyStats?.total ?? null}
        />

        {user && <TrophyShelf userId={user.id} />}

        <CoupleCard />

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Recent games</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <CardDescription>No games yet. Play today&apos;s Wordle.</CardDescription>
            ) : (
              <ul className="divide-y divide-white/50">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-semibold">
                        {h.word.toUpperCase()}{' '}
                        <span className="text-textSecondary font-normal">· {h.date}</span>
                      </p>
                      <p className="text-xs text-textSecondary">
                        {h.win ? `${h.guessesUsed}/6 guesses` : 'Did not solve'} · {formatTime(h.timeMs)}
                        {h.hintsUsed ? ` · ${h.hintsUsed} hint${h.hintsUsed === 1 ? '' : 's'}` : ''}
                      </p>
                    </div>
                    <span className={h.win ? 'flex items-center gap-1 text-success font-semibold' : 'text-textSecondary'}>
                      {h.win && <Trophy className="h-3.5 w-3.5" />}
                      {h.win ? 'Win' : 'Loss'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function UpdatesCard() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Reload ONLY after the new SW takes over as controller. Without this,
  // a synchronous reload after postMessage(SKIP_WAITING) races the
  // activation and gets served by the old SW, re-showing stale content.
  const activateAndReload = (waiting: ServiceWorker) => {
    const onChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Failsafe: if controllerchange doesn't fire within 3s, reload anyway.
    window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      window.location.reload();
    }, 3000);
  };

  const handleCheck = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (!('serviceWorker' in navigator)) {
        setStatus('Service workers aren\u2019t supported in this browser.');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setStatus('No service worker registered yet — open this page directly (not from a deep link) and try again.');
        return;
      }

      if (reg.waiting) {
        activateAndReload(reg.waiting);
        return;
      }

      const updateFound = new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 5000);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) {
            window.clearTimeout(timer);
            resolve(false);
            return;
          }
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              window.clearTimeout(timer);
              resolve(true);
            }
          });
        });
      });

      // `reg.update()` on Safari throws "TypeError: Load failed" when the
      // SW script fetch has any hiccup (cellular reconnect, recent update,
      // CORS-like weirdness). Swallow and continue — we still want the
      // user's click to result in *some* refresh.
      try {
        await reg.update();
      } catch (err) {
        console.warn('reg.update() failed; falling back to plain reload', err);
        window.location.reload();
        return;
      }

      const hasUpdate = await updateFound;
      const waiting = (reg as ServiceWorkerRegistration).waiting;
      if (hasUpdate && waiting) {
        activateAndReload(waiting);
        return;
      }
      setStatus('You\u2019re up to date.');
    } catch (err: any) {
      console.error('check for updates failed', err);
      // Never show raw "TypeError: Load failed" to the user — fall back
      // to a plain reload and let them retry next time if needed.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2 bg-white/80 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">App updates</p>
          <p className="text-xs text-textSecondary">
            Force-fetch the latest version if today&apos;s puzzle or leaderboard looks stale.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCheck} disabled={busy}>
          {busy ? 'Checking\u2026' : 'Check for updates'}
        </Button>
      </div>
      {status && <p className="text-xs text-textSecondary">{status}</p>}
    </Card>
  );
}

function NotificationsCard(props: {
  enabled: boolean;
  busy: boolean;
  error: string | null;
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  iosOk: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
}) {
  const { enabled, busy, error, supported, permission, iosOk, onToggle } = props;
  const denied = permission === 'denied';

  return (
    <Card className="space-y-2 bg-white/80 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Daily reminder</p>
          <p className="text-xs text-textSecondary">
            Ping at 10:00 AM Mountain Time if you haven&apos;t played today.
          </p>
        </div>
        <Button
          variant={enabled ? 'outline' : 'default'}
          size="sm"
          onClick={() => onToggle(!enabled)}
          disabled={busy || !supported || denied || (!enabled && !iosOk)}
        >
          {busy ? '…' : enabled ? 'On' : 'Turn on'}
        </Button>
      </div>
      {!supported && (
        <p className="text-xs text-textSecondary">
          This browser doesn&apos;t support push notifications.
        </p>
      )}
      {supported && !iosOk && (
        <p className="text-xs text-textSecondary">
          On iPhone, add this app to your Home Screen (Share → Add to Home Screen), then open it from the new icon.
        </p>
      )}
      {denied && (
        <p className="text-xs text-red-600">
          Notifications are blocked. Enable them in your browser or device settings to receive reminders.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function formatTime(ms: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function IdentityCard() {
  const { user } = useAuth();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawAvatar =
    (typeof meta.avatar_url === 'string' ? meta.avatar_url : '') ||
    (typeof meta.picture === 'string' ? meta.picture : '') ||
    '';
  const rawName =
    (typeof meta.full_name === 'string' ? meta.full_name : '') ||
    (typeof meta.name === 'string' ? meta.name : '') ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Player';
  const fullName = rawName.trim() || 'Player';
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => (Array.from(p)[0] ?? '').toUpperCase())
      .slice(0, 2)
      .join('') || '?';

  return (
    <Card className="flex items-center gap-4 bg-white/80 backdrop-blur">
      <Avatar className="h-14 w-14 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
        {rawAvatar && <AvatarImage src={rawAvatar} alt="" />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-heading font-semibold truncate">{fullName}</p>
        {user.email && <p className="text-sm text-textSecondary truncate">{user.email}</p>}
      </div>
    </Card>
  );
}
