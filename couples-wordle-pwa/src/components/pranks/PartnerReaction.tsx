import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const REACTIONS = [
  'babe … how',
  'we need to talk about cheating',
  "you didn't. 😐",
  'absolutely not — guess the real way',
  "that's not how this works"
];

export function PartnerReaction({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [reaction] = useState(() => REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);

  useEffect(() => {
    if (!open) return;
    setTyped('');
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setTyped(reaction.slice(0, i));
      if (i >= reaction.length) window.clearInterval(iv);
    }, 65);
    const t = window.setTimeout(onClose, 6500);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(t);
    };
  }, [open, reaction, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your partner saw your time and said…</DialogTitle>
          <DialogDescription className="pt-3 text-base text-foreground">
            <span className="font-semibold">“{typed}</span>
            <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-foreground">&nbsp;</span>
            <span className="font-semibold">”</span>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
