import { useEffect, useState } from 'react';

export function SuddenDarkMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'fade-in' | 'hold' | 'fade-out' | 'done'>('fade-in');

  useEffect(() => {
    if (!open) {
      setPhase('done');
      return;
    }
    setPhase('fade-in');
    const t1 = window.setTimeout(() => setPhase('hold'), 600);
    const t2 = window.setTimeout(() => setPhase('fade-out'), 3200);
    const t3 = window.setTimeout(() => {
      setPhase('done');
      onClose();
    }, 3800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, onClose]);

  if (!open || phase === 'done') return null;

  const opacity = phase === 'fade-in' || phase === 'hold' ? 0.92 : 0;
  const transition =
    phase === 'fade-in' ? 'opacity 0.6s ease-in' : phase === 'fade-out' ? 'opacity 0.6s ease-out' : 'none';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[95] grid place-items-center"
      style={{
        background:
          'radial-gradient(circle at center, rgba(120,20,20,0.55) 0%, rgba(10,0,0,0.92) 100%)',
        opacity,
        transition
      }}
    >
      <p className="font-heading text-3xl font-bold tracking-[0.3em] text-red-300 drop-shadow-[0_0_24px_rgba(255,40,40,0.8)]">
        REVIEWING…
      </p>
    </div>
  );
}
