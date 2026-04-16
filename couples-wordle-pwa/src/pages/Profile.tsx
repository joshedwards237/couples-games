import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { StreakCard } from '../components/StreakCard';
import { Leaderboard } from '../components/Leaderboard';
import { useAuth } from '../context/AuthContext';
import { fetchPuzzle } from '../lib/puzzles';
import { fetchGameHistory, fetchLeaderboard, fetchUserStats } from '../lib/stats';
import { getProfile, upsertDisplayName } from '../lib/profiles';
import type { GameHistoryEntry, LeaderboardEntry, Puzzle, UserStats } from '../lib/types';

export function Profile() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const profile = await getProfile(user.id);
        if (!cancelled) setDisplayName(profile?.displayName ?? '');

        const [userStats, userHistory, todayPuzzle] = await Promise.all([
          fetchUserStats(user.id),
          fetchGameHistory(user.id, 30),
          fetchPuzzle('classic')
        ]);
        if (cancelled) return;
        setStats(userStats);
        setHistory(userHistory);
        setPuzzle(todayPuzzle);

        setLeaderboardLoading(true);
        const board = await fetchLeaderboard(todayPuzzle.id, todayPuzzle.word, user.id);
        if (!cancelled) {
          setLeaderboard(board);
          setLeaderboardLoading(false);
        }
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
            Profile
          </h1>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>

        {error && (
          <Card className="bg-red-50 border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        <Card className="space-y-2 bg-white/80 backdrop-blur">
          <p className="text-sm text-textSecondary">Display name</p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-white/60 bg-white/90 px-3 py-2 outline-none shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
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
          <p className="text-xs text-textSecondary">Shown on the leaderboard. Signed in as {user?.email ?? user?.id}.</p>
        </Card>

        <StreakCard
          currentStreak={stats?.currentStreak ?? null}
          maxStreak={stats?.maxStreak ?? null}
          totalWins={stats?.totalWins ?? null}
        />

        <Leaderboard entries={leaderboard} loading={leaderboardLoading} />

        <Card className="space-y-2 bg-white/80 backdrop-blur">
          <h2 className="text-lg font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
            Recent games
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-textSecondary">No games yet. Play today&apos;s Wordle.</p>
          ) : (
            <ul className="divide-y divide-white/50">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-semibold">
                      {h.word.toUpperCase()} <span className="text-textSecondary font-normal">· {h.date}</span>
                    </p>
                    <p className="text-xs text-textSecondary">
                      {h.win ? `${h.guessesUsed}/6 guesses` : 'Did not solve'} · {formatTime(h.timeMs)}
                      {h.hintsUsed ? ` · ${h.hintsUsed} hint${h.hintsUsed === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <span className={h.win ? 'text-success font-semibold' : 'text-textSecondary'}>
                    {h.win ? 'Win' : 'Loss'}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
