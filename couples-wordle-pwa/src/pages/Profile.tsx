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
import { getProfile, upsertDisplayName } from '@/lib/profiles';
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const profile = await getProfile(user.id);
        if (!cancelled) setDisplayName(profile?.displayName ?? '');

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
              <Button variant="outline" size="sm" onClick={() => navigate('/prank')}>
                Prank dashboard
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
      .map((p) => p[0]?.toUpperCase() ?? '')
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
