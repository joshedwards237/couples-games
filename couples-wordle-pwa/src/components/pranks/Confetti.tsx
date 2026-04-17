import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Zero-dep confetti burst. Renders ~N pseudo-random colored squares that
 * fall + drift + spin via CSS. Parent controls visibility; the animation
 * runs to completion (~2.5s) whenever the element is in the DOM.
 */
export function Confetti({ count = 60, className }: { count?: number; className?: string }) {
  const pieces = useMemo(() => {
    const colors = ['#588157', '#3A5A40', '#A3B18A', '#DAD7CD', '#E0A83D', '#F5D76E'];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.4 + Math.random() * 1.4,
      rotate: Math.random() * 720 - 360,
      drift: (Math.random() * 2 - 1) * 60,
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length]
    }));
  }, [count]);

  return (
    <div className={cn('pointer-events-none fixed inset-0 z-[100] overflow-hidden', className)}>
      {pieces.map((p) => (
        <span
          key={p.id}
          aria-hidden
          style={{
            left: `${p.left}%`,
            top: '-10%',
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `confetti-fall ${p.duration}s cubic-bezier(0.22, 1, 0.36, 1) ${p.delay}s forwards`,
            ['--confetti-drift' as any]: `${p.drift}px`,
            ['--confetti-rotate' as any]: `${p.rotate}deg`
          }}
          className="absolute rounded-[2px]"
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--confetti-drift), 110vh) rotate(var(--confetti-rotate)); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
