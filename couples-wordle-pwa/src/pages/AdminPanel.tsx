import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/Layout';
import { Board } from '@/components/Board';
import { usePranks } from '@/context/PrankContext';
import { fetchPuzzle } from '@/lib/puzzles';
import { loadTestPuzzle, pickTestWord, saveTestPuzzle } from '@/lib/adminTestPuzzle';

export function AdminPanel() {
  const { isAdmin, loading } = usePranks();
  const navigate = useNavigate();

  const [todaysAnswer, setTodaysAnswer] = useState<string | null>(null);
  const [testWord, setTestWord] = useState<string | null>(null);
  const [testRows, setTestRows] = useState<string[]>([]);
  const [boardKey, setBoardKey] = useState(0);
  const [finished, setFinished] = useState(false);

  // Load today's daily answer so the test pool can exclude it, then hydrate
  // any previously-saved test puzzle state from localStorage.
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  const handleNewWord = () => {
    const w = pickTestWord(todaysAnswer ?? undefined, testWord ?? undefined);
    setTestWord(w);
    setTestRows([]);
    setFinished(false);
    saveTestPuzzle({ word: w, rows: [], finished: false });
    setBoardKey((k) => k + 1);
  };

  const handleClearProgress = () => {
    if (!testWord) return;
    setTestRows([]);
    setFinished(false);
    saveTestPuzzle({ word: testWord, rows: [], finished: false });
    setBoardKey((k) => k + 1);
  };

  const handleProgress = (rows: string[]) => {
    if (!testWord) return;
    setTestRows(rows);
    saveTestPuzzle({ word: testWord, rows, finished: false });
  };

  const handleComplete = ({ rows }: { win: boolean; rows: string[] }) => {
    if (!testWord) return;
    setTestRows(rows);
    setFinished(true);
    saveTestPuzzle({ word: testWord, rows, finished: true });
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
              />
            ) : (
              <p className="text-sm text-textSecondary">Loading test word…</p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
