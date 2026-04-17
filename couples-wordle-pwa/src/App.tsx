import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Board } from '@/components/Board';
import { Layout, Pill } from '@/components/Layout';
import { InstallPrompt } from '@/components/InstallPrompt';
import { Leaderboard } from '@/components/Leaderboard';
import { supabase } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useA2HS } from '@/hooks/useA2HS';
import { fetchPuzzle } from '@/lib/puzzles';
import { fetchLeaderboard, saveAttempt } from '@/lib/stats';
import type { LeaderboardEntry, Puzzle } from '@/lib/types';
import './styles/globals.css';
import { Profile } from '@/pages/Profile';

export default function App() {
  return (
    <AuthProvider>
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
      </Routes>
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
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMagic = async () => {
    setError(null);
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

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
      <Card className="space-y-4 bg-white/80 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle>Sign in to play</CardTitle>
          <CardDescription>You need an account to save stats and see the leaderboard.</CardDescription>
        </CardHeader>

        <Button onClick={signInGoogle} className="w-full">
          Continue with Google
        </Button>

        <div className="flex items-center gap-2 text-xs text-textSecondary">
          <div className="h-px flex-1 bg-white/60" />
          or
          <div className="h-px flex-1 bg-white/60" />
        </div>

        <div className="space-y-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={sendMagic} disabled={!email} className="w-full">
            {sent ? 'Link sent — check your email' : 'Send magic link'}
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>
    </Layout>
  );
}

function Home() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { shouldShow, dismiss } = useA2HS();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const puzzle = await fetchPuzzle('classic');
        const board = await fetchLeaderboard(puzzle.id, puzzle.word, user.id);
        if (!cancelled) setLeaderboard(board);
      } catch (e) {
        console.error('leaderboard load failed', e);
      } finally {
        if (!cancelled) setLeaderboardLoading(false);
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
        <header className="flex justify-end">
          <UserMenu onProfile={() => navigate('/profile')} onSignOut={signOut} />
        </header>

        <div className="flex justify-center py-6">
          <Button size="xl" onClick={() => navigate('/play/classic')} className="min-w-[220px]">
            Today&apos;s Wordle
          </Button>
        </div>

        <Leaderboard entries={leaderboard} loading={leaderboardLoading} />

        {shouldShow && <InstallPrompt onDismiss={dismiss} />}
      </section>
    </Layout>
  );
}

function UserMenu({ onProfile, onSignOut }: { onProfile: () => void; onSignOut: () => void }) {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl = (meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || undefined;
  const fullName =
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    (user?.email ? user.email.split('@')[0] : 'Player');
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2"
        >
          <Avatar className="h-10 w-10 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-semibold truncate">{fullName}</p>
            {user?.email && <p className="text-xs text-textSecondary truncate">{user.email}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onProfile}>
          <UserIcon />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Play() {
  const { pathname } = useLocation();
  const lane = pathname.endsWith('couple') ? 'couple' : 'classic';
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [done, setDone] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const p = await fetchPuzzle(lane as 'classic' | 'couple');
        setPuzzle(p);
        startedAtRef.current = Date.now();
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? 'Failed to load puzzle');
      }
    };
    void load();
  }, [lane]);

  const handleComplete = async ({ win, rows }: { win: boolean; rows: string[] }) => {
    setDone(true);
    if (!user || !puzzle) {
      setSaveState('error');
      setSaveError(!user ? 'You are signed out — not saved.' : 'Puzzle not loaded — nothing to save.');
      return;
    }
    const timeMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveAttempt({
        userId: user.id,
        puzzleId: puzzle.id,
        rows,
        timeMs,
        hintsUsed: 0,
        lane: lane as 'classic' | 'couple',
        mode: 'coop',
        win,
        finished: true
      });
      setSaveState('saved');
    } catch (e: any) {
      console.error('saveAttempt failed', e);
      setSaveState('error');
      setSaveError(e?.message ?? 'Save failed');
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <Link to="/" className="text-sm text-accent">
          ← Back
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">Daily Wordle</h1>
          <Pill active label="5 letters" />
        </div>
        {error ? (
          <Card>
            <p className="text-sm text-red-600">{error}</p>
          </Card>
        ) : puzzle ? (
          <Board answer={puzzle.word} onComplete={handleComplete} />
        ) : (
          <Card>Loading puzzle…</Card>
        )}
        {done && (
          <Card className="text-center space-y-2 bg-white/80 backdrop-blur">
            {saveState === 'saving' && <p className="font-semibold">Saving…</p>}
            {saveState === 'saved' && <p className="font-semibold">Saved to your profile.</p>}
            {saveState === 'error' && (
              <>
                <p className="font-semibold text-red-600">Could not save your game.</p>
                {saveError && <p className="text-xs text-textSecondary">{saveError}</p>}
              </>
            )}
            <Button onClick={() => window.location.assign('/profile')}>
              See today&apos;s leaderboard
            </Button>
          </Card>
        )}
      </div>
    </Layout>
  );
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
