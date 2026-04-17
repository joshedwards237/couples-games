import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchMyTrophyStats } from '@/lib/trophies';

export function HeaderTrophyCount() {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setCount(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const s = await fetchMyTrophyStats(user.id);
        if (!cancelled) setCount(s.total);
      } catch {
        /* silent — pill just stays hidden */
      }
    };
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user]);

  if (!user || count === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent"
      title={`${count} trophies`}
    >
      <Trophy className="h-3.5 w-3.5" />
      {count}
    </span>
  );
}
