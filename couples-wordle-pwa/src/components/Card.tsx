import { cn } from '../utils/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-surface p-4 shadow-md shadow-black/5 border border-white/40 backdrop-blur-sm',
        className
      )}
      {...props}
    />
  );
}
