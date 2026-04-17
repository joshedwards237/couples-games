import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function InstantDm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'dm' | 'snapback'>('dm');
  const snapbackTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (snapbackTimer.current !== null) window.clearTimeout(snapbackTimer.current);
    };
  }, []);

  const handleDismiss = () => {
    if (phase === 'snapback') return;
    setPhase('snapback');
    snapbackTimer.current = window.setTimeout(() => {
      snapbackTimer.current = null;
      onClose();
    }, 3500);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent>
        {phase === 'dm' ? (
          <>
            <DialogHeader>
              <DialogTitle>Message from the developer</DialogTitle>
              <DialogDescription className="pt-2">
                Hey — we noticed you solved that fast. Mind sharing your strategy? We're building a
                training dataset for opening-word picks…
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={handleDismiss}>
                Dismiss
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Actually, never mind 😉</DialogTitle>
              <DialogDescription>We already know.</DialogDescription>
            </DialogHeader>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
