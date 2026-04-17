import { useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { evaluateRow } from '@/lib/stats';
import type { LetterEval } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answer: string;
  rows: string[];
  win: boolean;
  date: string;
}

const TILE_EMOJI: Record<LetterEval, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬜',
  unknown: '⬜'
};

export function ShareResultDialog({ open, onOpenChange, answer, rows, win, date }: Props) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const evaluations = rows.map((r) => evaluateRow(r, answer));
  const score = win ? `${rows.length}/6` : 'X/6';
  const gridText = evaluations.map((row) => row.map((s) => TILE_EMOJI[s]).join('')).join('\n');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareText = `Couples Wordle · ${date} · ${score}\n\n${gridText}${origin ? `\n\n${origin}` : ''}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('copy failed', e);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({ text: shareText });
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error('share failed', e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share today&apos;s result</DialogTitle>
          <DialogDescription>
            {win ? `Solved in ${score}` : 'Did not solve'} · {date}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-1">
          {evaluations.map((row, r) => (
            <div key={r} className="flex justify-center gap-1">
              {row.map((state, c) => (
                <MaskedTile key={c} state={state} />
              ))}
            </div>
          ))}
        </div>

        <DialogFooter className="mt-5 gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check /> : <Copy />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          {canShare && (
            <Button onClick={handleShare}>
              <Share2 />
              <span>Share</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaskedTile({ state }: { state: LetterEval }) {
  const color: Record<LetterEval, string> = {
    correct: 'bg-success',
    present: 'bg-warning',
    absent: 'bg-brand-sage/60',
    unknown: 'bg-white/60'
  };
  return <div className={cn('h-6 w-6 rounded-sm border border-white/40', color[state])} />;
}
