import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check, Trophy, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout';
import { StreakCard } from '@/components/StreakCard';
import { TrophyShelf } from '@/components/TrophyShelf';
import { IdentityCardView } from '@/components/IdentityCardView';
import { useAuth } from '@/context/AuthContext';
import { getProfile } from '@/lib/profiles';
import { fetchGameHistory, fetchUserStats } from '@/lib/stats';
import { fetchMyTrophyStats } from '@/lib/trophies';
import type { GameHistoryEntry, Profile, TrophyStats, UserStats } from '@/lib/types';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

const HISTORY_LIMIT = 10;

export function UserProfile() {
  const { userId = '' } = useParams<{ userId: string }>();
  const { user } = useAuth();

  const [state, setState] = useState<LoadState>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [trophyStats, setTrophyStats] = useState<TrophyStats | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);

  useEffect(() => {
    if (!userId) {
      setState('not-found');
      return;
    }
    let cancelled = false;

    const load = async () => {
      setState('loading');
      setErr(null);
      try {
        const p = await getProfile(userId);
        if (cancelled) return;
        if (!p) {
          setState('not-found');
          return;
        }
        setProfile(p);

        const [userStats, userHistory, userTrophyStats] = await Promise.all([
          fetchUserStats(userId),
          fetchGameHistory(userId, HISTORY_LIMIT),
          fetchMyTrophyStats(userId)
        ]);
        if (cancelled) return;
        setStats(userStats);
        setHistory(userHistory);
        setTrophyStats(userTrophyStats);
        setState('loaded');
      } catch (e: any) {
        if (cancelled) return;
        console.error('UserProfile load failed', e);
        setErr(e?.message ?? 'Failed to load profile');
        setState('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Self-view: redirect to the editable /profile.
  if (user && userId && user.id === userId) {
    return <Navigate to="/profile" replace />;
  }

  if (state === 'loading') {
    return (
      <Layout>
        <Card className="bg-white/80 backdrop-blur">
          <p className="p-3 text-sm text-textSecondary">Loading…</p>
        </Card>
      </Layout>
    );
  }

  if (state === 'not-found' || !profile) {
    return (
      <Layout>
        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>User not found</CardTitle>
            <CardDescription>
              We couldn&apos;t find a player with that id. They may have deleted their account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to leaderboard</Link>
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (state === 'error') {
    return (
      <Layout>
        <Card className="border-red-200 bg-red-50">
          <p className="p-3 text-sm text-red-700">{err ?? 'Something went wrong.'}</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">Profile</h1>

        <IdentityCardView profile={profile} />

        <StreakCard
          currentStreak={stats?.currentStreak ?? null}
          maxStreak={stats?.maxStreak ?? null}
          totalSolves={stats?.totalSolves ?? null}
        />

        <TrophyShelf userId={userId} />

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Recent games</CardTitle>
            <CardDescription>Last {HISTORY_LIMIT} finished puzzles.</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <CardDescription>No games yet.</CardDescription>
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
                        {h.outcome === 'missed' ? 'Did not solve' : `${h.guessesUsed}/6 guesses`} · {formatTime(h.timeMs)}
                      </p>
                    </div>
                    <OutcomeBadge outcome={h.outcome} />
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

function OutcomeBadge({ outcome }: { outcome: 'h2h_win' | 'solved' | 'missed' }) {
  if (outcome === 'h2h_win') {
    return (
      <span className="flex items-center gap-1 text-success font-semibold">
        <Trophy className="h-3.5 w-3.5" />
        Win
      </span>
    );
  }
  if (outcome === 'solved') {
    return (
      <span className="flex items-center gap-1.5 text-textSecondary">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-success/20 text-success">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        Solved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-textSecondary">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-black/10 text-textSecondary">
        <X className="h-3 w-3" strokeWidth={3} />
      </span>
      Missed
    </span>
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
