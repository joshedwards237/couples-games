import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout';
import { Board } from '@/components/Board';
import { NarrativeOrchestrator } from '@/components/pranks/NarrativeOrchestrator';
import { UsersCard } from '@/components/UsersCard';
import { usePranks } from '@/context/PrankContext';
import { fetchPuzzle } from '@/lib/puzzles';
import { supabase } from '@/lib/supabase';
import { loadTestPuzzle, pickTestWord, saveTestPuzzle } from '@/lib/adminTestPuzzle';

/**
 * Card for firing an additional daily Wordle (a "bonus" puzzle) that
 * every user can play alongside the regular daily. The generated word
 * is intentionally hidden from the admin — the RPC returns only id +
 * date so the admin plays the bonus blind like everyone else.
 */
function BonusWordleCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'none' | 'live'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const checkStatus = async () => {
    setStatus('loading');
    try {
      const p = await fetchPuzzle('bonus');
      setStatus(p ? 'live' : 'none');
    } catch {
      setStatus('none');
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const fire = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.rpc('admin_create_bonus_puzzle');
      if (error) {
        // Self-heal: if a bonus somehow already exists, refresh status.
        if (/already exists/i.test(error.message ?? '')) {
          await checkStatus();
          setMsg('A bonus is already live for today.');
        } else if (/not authorized/i.test(error.message ?? '')) {
          setMsg('You are not authorized to fire a bonus.');
        } else {
          setMsg(error.message ?? 'Could not fire bonus.');
        }
        return;
      }
      setStatus('live');
      setMsg('Bonus fired — good luck 🎲');
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not fire bonus.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Bonus Wordle</CardTitle>
        <CardDescription>
          Fire an extra daily Wordle for every user. The word is random and won&apos;t
          be shown to you — you play it blind like everyone else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-textSecondary">
          Status:{' '}
          {status === 'loading' ? (
            'Checking…'
          ) : status === 'live' ? (
            <span className="font-semibold text-success">● Bonus is live</span>
          ) : (
            <span>● No bonus today</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={fire} disabled={busy || status !== 'none'}>
            {busy ? 'Firing…' : status === 'live' ? 'Already fired' : 'Fire bonus'}
          </Button>
          {status === 'live' && (
            <Button size="sm" variant="outline" onClick={() => navigate('/play/bonus')}>
              Play today&apos;s bonus
            </Button>
          )}
        </div>
        {msg && <p className="text-xs text-textSecondary">{msg}</p>}
      </CardContent>
    </Card>
  );
}

export function AdminPanel() {
  const { isAppAdmin, isPrankAdmin, loading } = usePranks();
  const navigate = useNavigate();

  const [todaysAnswer, setTodaysAnswer] = useState<string | null>(null);
  const [testWord, setTestWord] = useState<string | null>(null);
  const [testRows, setTestRows] = useState<string[]>([]);
  const [boardKey, setBoardKey] = useState(0);
  const [finished, setFinished] = useState(false);
  const [winInfo, setWinInfo] = useState<{ guessesUsed: number; round: number } | null>(null);

  // Load today's daily answer so the test pool can exclude it, then hydrate
  // any previously-saved test puzzle state from localStorage.
  useEffect(() => {
    if (!isAppAdmin) return;
    let cancelled = false;
    (async () => {
      let daily: string | null = null;
      try {
        const p = await fetchPuzzle('classic');
        daily = p.word.toUpperCase();
      } catch (e) {
        console.error('fetchPuzzle for admin test failed', e);
      }
      if (cancelled) return;
      setTodaysAnswer(daily);

      const saved = loadTestPuzzle();
      if (saved?.word) {
        setTestWord(saved.word);
        setTestRows(saved.rows);
        setFinished(!!saved.finished);
      } else {
        const w = pickTestWord(daily ?? undefined);
        setTestWord(w);
        saveTestPuzzle({ word: w, rows: [], finished: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAppAdmin]);

  if (!loading && !isAppAdmin) return <Navigate to="/" replace />;
  if (loading) {
    return (
      <Layout>
        <Card className="bg-white/80 backdrop-blur">
          <CardContent className="py-6 text-sm text-textSecondary">Loading…</CardContent>
        </Card>
      </Layout>
    );
  }

  const handleNewWord = () => {
    const w = pickTestWord(todaysAnswer ?? undefined, testWord ?? undefined);
    setTestWord(w);
    setTestRows([]);
    setFinished(false);
    setWinInfo(null);
    saveTestPuzzle({ word: w, rows: [], finished: false });
    setBoardKey((k) => k + 1);
  };

  const handleClearProgress = () => {
    if (!testWord) return;
    setTestRows([]);
    setFinished(false);
    setWinInfo(null);
    saveTestPuzzle({ word: testWord, rows: [], finished: false });
    setBoardKey((k) => k + 1);
  };

  const handleProgress = (rows: string[]) => {
    if (!testWord) return;
    setTestRows(rows);
    saveTestPuzzle({ word: testWord, rows, finished: false });
  };

  const handleComplete = ({ win, rows }: { win: boolean; rows: string[] }) => {
    if (!testWord) return;
    setTestRows(rows);
    setFinished(true);
    saveTestPuzzle({ word: testWord, rows, finished: true });
    if (win) setWinInfo({ guessesUsed: rows.length, round: boardKey });
    else setWinInfo(null);
  };

  const initialRows = useMemo(() => testRows, [boardKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-textSecondary">Admin</p>
          <h1 className="font-heading text-2xl font-bold">Admin</h1>
          <p className="text-sm text-textSecondary">
            Admin-only utilities. Test puzzle state lives in this browser only — it never touches Supabase, leaderboards, streaks, or trophies.
          </p>
        </div>

        {isPrankAdmin && (
          <Card className="bg-white/80 backdrop-blur">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base">Prank dashboard</CardTitle>
                <CardDescription>Toggle pranks, tune probabilities, and exempt users.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/prank')}>
                Open
              </Button>
            </CardHeader>
          </Card>
        )}

        <BonusWordleCard />

        <UsersCard />

        <Card className="bg-white/80 backdrop-blur">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Test puzzle</CardTitle>
            <CardDescription>
              Always-active puzzle for development. Different from today&apos;s Wordle and fully isolated from your daily progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleNewWord}>
                New word
              </Button>
              <Button size="sm" variant="outline" onClick={handleClearProgress} disabled={!testWord}>
                Clear progress
              </Button>
              {finished && testWord && (
                <span className="text-xs text-textSecondary">
                  Finished — answer was {testWord}. Hit &quot;New word&quot; or &quot;Clear progress&quot; to play again.
                </span>
              )}
            </div>

            {testWord ? (
              <Board
                key={boardKey}
                answer={testWord}
                initialRows={initialRows}
                onProgress={handleProgress}
                onComplete={handleComplete}
                testMode
              />
            ) : (
              <p className="text-sm text-textSecondary">Loading test word…</p>
            )}
          </CardContent>
        </Card>

        {winInfo && testWord && (
          <NarrativeOrchestrator
            key={`admin-test-narrative:${winInfo.round}`}
            guessesUsed={winInfo.guessesUsed}
            puzzleId={`admin-test:${testWord}:${winInfo.round}`}
            testMode
          />
        )}
      </div>
    </Layout>
  );
}
