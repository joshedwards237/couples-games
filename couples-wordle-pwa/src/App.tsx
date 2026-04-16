import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { Board } from './components/Board';
import { Layout, Pill } from './components/Layout';
import { InstallPrompt } from './components/InstallPrompt';
import { LaneCard } from './components/LaneCard';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useA2HS } from './hooks/useA2HS';
import { fetchPuzzle } from './lib/puzzles';
import { saveAttempt } from './lib/stats';
import type { Puzzle } from './lib/types';
import './styles/globals.css';
import { Profile } from './pages/Profile';

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
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
            Sign in to play
          </h1>
          <p className="text-sm text-textSecondary">You need an account to save stats and see the leaderboard.</p>
        </div>

        <Button variant="primary" onClick={signInGoogle} className="w-full">
          Continue with Google
        </Button>

        <div className="flex items-center gap-2 text-xs text-textSecondary">
          <div className="h-px flex-1 bg-white/60" />
          or
          <div className="h-px flex-1 bg-white/60" />
        </div>

        <div className="space-y-2">
          <input
            className="w-full rounded-md border border-white/60 bg-white/90 px-3 py-2 outline-none shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
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

  return (
    <Layout>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
              Daily Wordle
            </h1>
            <p className="text-xs text-textSecondary truncate">Signed in as {user?.email ?? user?.id}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/profile')}>
              Profile
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          <LaneCard
            title="Today's Wordle"
            description="Everyone gets the same word today. Fewest guesses wins."
            pillLabel="5 letters"
            variant="primary"
            onSelect={() => navigate('/play/classic')}
          />
        </div>

        {shouldShow && <InstallPrompt onDismiss={dismiss} />}
      </section>
    </Layout>
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'SF Pro Rounded, system-ui' }}>
            Daily Wordle
          </h1>
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
            <Button variant="primary" onClick={() => window.location.assign('/profile')}>
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
