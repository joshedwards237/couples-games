import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function FalsePositive({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'error' | 'jk' | 'done'>('error');

  useEffect(() => {
    if (!open) return;
    setPhase('error');
    const t1 = window.setTimeout(() => setPhase('jk'), 8000);
    const t2 = window.setTimeout(() => {
      setPhase('done');
      onClose();
    }, 11000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, onClose]);

  if (!open || phase === 'done') return null;

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-6 left-1/2 z-[90] w-[min(92vw,360px)] -translate-x-1/2',
        'rounded-md border px-4 py-3 shadow-xl backdrop-blur',
        phase === 'error'
          ? 'border-red-300 bg-red-50/95 text-red-800'
          : 'border-accent/40 bg-white/95 text-foreground'
      )}
      role="alert"
    >
      {phase === 'error' ? (
        <>
          <p className="text-sm font-bold">Save failed: rate limit</p>
          <p className="text-xs opacity-80">Your score could not be recorded. Please try again later.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold">Just kidding 😉</p>
          <p className="text-xs opacity-80">Your 2-guess flex was saved perfectly.</p>
        </>
      )}
    </div>
  );
}
