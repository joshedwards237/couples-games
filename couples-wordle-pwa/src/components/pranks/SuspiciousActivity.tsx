import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export function SuspiciousActivity({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<'captcha' | 'resolved'>('captcha');
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('captcha');
    const t = window.setTimeout(() => setPhase('resolved'), 12_000);
    const t2 = window.setTimeout(onClose, 14_500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [open, onClose]);

  const flash = (i: number) => {
    setShakeIdx(i);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null;
      setShakeIdx(null);
    }, 350);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {phase === 'captcha' ? (
          <>
            <DialogHeader>
              <DialogTitle>🚨 Unusual play speed detected</DialogTitle>
              <DialogDescription>
                Quick verification. Click all the squares that are <span className="font-semibold">not green</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: 16 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => flash(i)}
                  className={`h-14 w-full rounded-md border border-brand-fern/50 bg-brand-fern transition ${
                    shakeIdx === i ? 'animate-pulse border-red-500 ring-2 ring-red-500' : ''
                  }`}
                  aria-label={`square ${i + 1}`}
                />
              ))}
            </div>

            <p className="mt-3 text-xs text-textSecondary">
              Awaiting correct selection… your score is on hold.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Verification passed 😉</DialogTitle>
              <DialogDescription>Eh, close enough. You're good.</DialogDescription>
            </DialogHeader>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
