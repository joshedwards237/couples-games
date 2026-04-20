import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { Share2 } from 'lucide-react';
import { Board } from '@/components/Board';
import { CompletedBoard } from '@/components/CompletedBoard';
import { Layout } from '@/components/Layout';
import { InstallPrompt } from '@/components/InstallPrompt';
import { InviteBanner } from '@/components/InviteBanner';
import { Leaderboard } from '@/components/Leaderboard';
import { MonthlyLeaderboard } from '@/components/MonthlyLeaderboard';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { ShareResultDialog } from '@/components/ShareResultDialog';
import { NarrativeOrchestrator } from '@/components/pranks/NarrativeOrchestrator';
import { setPendingInvite } from '@/lib/couples';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PrankProvider } from '@/context/PrankContext';
import { useA2HS } from '@/hooks/useA2HS';
import { useCelebration } from '@/hooks/useCelebration';
import { fetchPuzzle } from '@/lib/puzzles';
import { fetchLeaderboard, fetchMonthlyWinsLeaderboard, fetchMyAttempt, saveAttempt } from '@/lib/stats';
import type { LeaderboardEntry, MonthlyLeaderboardEntry, MyAttempt, Puzzle } from '@/lib/types';
import './styles/globals.css';
import { Profile } from '@/pages/Profile';
import { PrankDashboard } from '@/pages/PrankDashboard';
import { AdminPanel } from '@/pages/AdminPanel';
import { UserProfile } from '@/pages/UserProfile';

// Captured synchronously at module load — before any child useEffect runs.
// Ordering matters: React fires useEffects child-first, so if this lived in
// App's useEffect the InviteBanner would miss the pending id on first mount.
if (typeof window !== 'undefined') {
  try {
    const url = new URL(window.location.href);
    const inviteId = url.searchParams.get('invite');
    if (inviteId) {
      setPendingInvite(inviteId);
      url.searchParams.delete('invite');
      const cleaned =
        url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
      window.history.replaceState({}, '', cleaned);
    }
  } catch (e) {
    console.error('invite capture failed', e);
  }
}

export default function App() {
  return (
    <AuthProvider>
      <PrankProvider>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <AuthGate>
                <Home />
              </AuthGate>
            }
          />
          <Route
            path="/play/:lane"
            element={
              <AuthGate>
                <Play />
              </AuthGate>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGate>
                <Profile />
              </AuthGate>
            }
          />
          <Route
            path="/prank"
            element={
              <AuthGate>
                <PrankDashboard />
              </AuthGate>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGate>
                <AdminPanel />
              </AuthGate>
            }
          />
          <Route
            path="/users/:userId"
            element={
              <AuthGate>
                <UserProfile />
              </AuthGate>
            }
          />
        </Routes>
        <Toaster />
        <PwaUpdatePrompt />
      </PrankProvider>
    </AuthProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Layout>
        <Card>Loading…</Card>
      </Layout>
    );
  }
  if (!user) return <SignIn />;
  return <>{children}</>;
}

function SignIn() {
  const [error, setError] = useState<string | null>(null);

  const signInGoogle = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setError(error.message);
  };

  return (
    <Layout>
      <div className="space-y-4">
        <InviteBanner />
        <Card className="space-y-4 bg-white/80 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle>Sign in to play</CardTitle>
            <CardDescription>You need an account to save stats and see the leaderboard.</CardDescription>
          </CardHeader>

          <Button onClick={signInGoogle} className="w-full">
            Continue with Google
          </Button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </Card>
      </div>
    </Layout>
  );
}

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shouldShow, dismiss } = useA2HS();
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthlyLeaderboardEntry[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [finishedToday, setFinishedToday] = useState(false);
  const [bonusAvailable, setBonusAvailable] = useState(false);
  const [bonusFinished, setBonusFinished] = useState(false);

  useCelebration(puzzleId);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const puzzle = await fetchPuzzle('classic');
        const [board, myAttempt, monthlyRows, bonusPuzzle] = await Promise.all([
          fetchLeaderboard(puzzle.id, puzzle.word, user.id),
          fetchMyAttempt(user.id, puzzle.id),
          fetchMonthlyWinsLeaderboard(user.id).catch((e) => {
            console.error('monthly leaderboard failed', e);
            return [] as MonthlyLeaderboardEntry[];
          }),
          fetchPuzzle('bonus').catch(() => null)
        ]);
        if (cancelled) return;
        setPuzzleId(puzzle.id);
        setLeaderboard(board);
        setMonthly(monthlyRows);
        setFinishedToday(Boolean(myAttempt?.finished));

        if (bonusPuzzle) {
          setBonusAvailable(true);
          const bonusAttempt = await fetchMyAttempt(user.id, bonusPuzzle.id);
          if (!cancelled) setBonusFinished(Boolean(bonusAttempt?.finished));
        } else {
          setBonusAvailable(false);
          setBonusFinished(false);
        }
      } catch (e) {
        console.error('home load failed', e);
      } finally {
        if (!cancelled) {
          setLeaderboardLoading(false);
          setMonthlyLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <Layout>
      <section className="space-y-6">
        <InviteBanner />

        <div className="flex flex-col items-center gap-3 py-6">
          <Button size="xl" onClick={() => navigate('/play/classic')} className="min-w-[220px]">
            {finishedToday ? 'View your attempt' : "Today's Wordle"}
          </Button>
          {bonusAvailable && (
            <Button
              size="xl"
              variant="outline"
              onClick={() => navigate('/play/bonus')}
              className="min-w-[220px]"
            >
              {bonusFinished ? 'View bonus attempt' : 'Bonus Wordle 🎲'}
            </Button>
          )}
        </div>

        <Leaderboard entries={leaderboard} loading={leaderboardLoading} puzzleId={puzzleId} />

        <MonthlyLeaderboard entries={monthly} loading={monthlyLoading} />

        {shouldShow && <InstallPrompt onDismiss={dismiss} />}
      </section>
    </Layout>
  );
}

interface PlayResult {
  win: boolean;
  guesses: number;
  timeMs: number;
  answer: string;
  rows: string[];
}

function Play() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lane: 'classic' | 'bonus' = pathname.endsWith('bonus') ? 'bonus' : 'classic';
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [existingAttempt, setExistingAttempt] = useState<MyAttempt | null>(null);
  const [inProgress, setInProgress] = useState<MyAttempt | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const { user } = useAuth();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const p = await fetchPuzzle(lane);
        if (cancelled) return;
        if (!p) {
          // Bonus lane with no bonus fired yet — the only lane that can
          // return null. Surface a specific message instead of crashing.
          setError('No bonus Wordle is live right now. Check back later.');
          return;
        }
        setPuzzle(p);
        const existing = user ? await fetchMyAttempt(user.id, p.id) : null;
        if (cancelled) return;
        if (existing?.finished) {
          setExistingAttempt(existing);
        } else if (existing && (existing.rows?.length ?? 0) > 0) {
          // In-progress attempt exists — rehydrate the board and set the
          // timer so cumulative elapsed picks up where we left off.
          setInProgress(existing);
          startedAtRef.current = Date.now() - (existing.timeMs || 0);
        } else {
          startedAtRef.current = Date.now();
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error(e);
          setError(e?.message ?? 'Failed to load puzzle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [lane, user]);

  const handleProgress = async (rows: string[]) => {
    if (!puzzle || !user) return;
    const timeMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    try {
      await saveAttempt({
        userId: user.id,
        puzzleId: puzzle.id,
        rows,
        timeMs,
        hintsUsed: 0,
        lane: lane,
        mode: 'coop',
        win: false,
        finished: false
      });
    } catch (e) {
      // In-progress save failures are non-fatal: board state in memory is
      // still authoritative, and the next guess will try to save again.
      console.error('saveAttempt (progress) failed', e);
    }
  };

  const handleComplete = async ({ win, rows }: { win: boolean; rows: string[] }) => {
    if (!puzzle) return;
    const timeMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    setResult({ win, guesses: rows.length, timeMs, answer: puzzle.word, rows });
    if (!user) {
      setSaveError('You are signed out — not saved.');
      return;
    }
    try {
      await saveAttempt({
        userId: user.id,
        puzzleId: puzzle.id,
        rows,
        timeMs,
        hintsUsed: 0,
        lane: lane,
        mode: 'coop',
        win,
        finished: true
      });
    } catch (e: any) {
      console.error('saveAttempt failed', e);
      setSaveError(e?.message ?? 'Save failed');
    }
  };

  const summary: PlayResult | null = result
    ? result
    : existingAttempt && puzzle
      ? {
          win: existingAttempt.win,
          guesses: existingAttempt.guessesUsed,
          timeMs: existingAttempt.timeMs,
          answer: puzzle.word,
          rows: existingAttempt.rows
        }
      : null;

  return (
    <Layout>
      <div className="space-y-4">
        {error ? (
          <Card>
            <p className="text-sm text-red-600">{error}</p>
          </Card>
        ) : loading || !puzzle ? (
          <Card>Loading puzzle…</Card>
        ) : existingAttempt ? (
          <CompletedBoard answer={puzzle.word} rows={existingAttempt.rows} />
        ) : (
          <Board
            answer={puzzle.word}
            initialRows={inProgress?.rows}
            onProgress={handleProgress}
            onComplete={handleComplete}
          />
        )}
        {summary && (
          <Card className="flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur">
            <div className="min-w-0">
              <p className="font-semibold">
                {summary.win
                  ? `Solved in ${summary.guesses} ${summary.guesses === 1 ? 'guess' : 'guesses'} · ${formatTime(summary.timeMs)}`
                  : `Out of guesses — answer was ${summary.answer.toUpperCase()}`}
              </p>
              {saveError && <p className="text-xs text-red-600">Couldn&apos;t save: {saveError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Share result"
                onClick={() => setShareOpen(true)}
              >
                <Share2 />
              </Button>
              <Button onClick={() => navigate('/')}>See today&apos;s leaderboard</Button>
            </div>
          </Card>
        )}
        {summary?.win && puzzle && (
          <NarrativeOrchestrator
            key={`narrative-pranks:${puzzle.id}`}
            guessesUsed={summary.guesses}
            puzzleId={puzzle.id}
          />
        )}
        {summary && puzzle && (
          <ShareResultDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            answer={summary.answer}
            rows={summary.rows}
            win={summary.win}
            date={puzzle.date}
          />
        )}
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

function AuthCallback() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Supabase client is configured with detectSessionInUrl: true, so it auto-
  // consumes the ?code= or #access_token= and fires SIGNED_IN on the listener.
  // We just wait for the auth state to populate, then navigate.
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(t);
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grid place-items-center bg-background text-textPrimary">
      <Card className="space-y-2 text-center">
        <p>Signing you in…</p>
        {timedOut && (
          <>
            <p className="text-sm text-textSecondary">
              This is taking longer than expected.
            </p>
            <Button variant="ghost" onClick={() => navigate('/', { replace: true })}>
              Back to sign in
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
