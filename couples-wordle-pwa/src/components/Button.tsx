import { cn } from '../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-md font-semibold transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent/60';
  const variants: Record<typeof variant, string> = {
    primary: 'bg-accent text-white px-4 py-2 shadow-md shadow-black/10',
    ghost: 'bg-surface text-textPrimary px-4 py-2 border border-white/60'
  } as const;

  return <button className={cn(base, variants[variant], className)} {...props} />;
}
