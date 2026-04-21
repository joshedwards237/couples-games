import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { CouplePill } from '@/components/CouplePill';
import { CoupleMonthlyModal } from '@/components/CoupleMonthlyModal';
import { cn } from '@/lib/utils';
import type { GlobalMonthlyCoupleEntry, MonthlyLeaderboardEntry } from '@/lib/types';

interface Props {
  entries: MonthlyLeaderboardEntry[];
  globalCoupleEntries?: GlobalMonthlyCoupleEntry[];
  loading?: boolean;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver',
  month: 'long'
}).format(new Date());

export function MonthlyLeaderboard({ entries, globalCoupleEntries = [], loading }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'couple' | 'global'>('couple');
  const [openCouple, setOpenCouple] = useState<GlobalMonthlyCoupleEntry | null>(null);

  // Same-rank tiebreak: walk the sorted list and only advance the rank when
  // the wins count drops. Ties keep the previous rank number.
  const withRanks = (() => {
    const out: Array<MonthlyLeaderboardEntry & { rank: number }> = [];
    let lastWins = Infinity;
    let lastRank = 0;
    entries.forEach((e, idx) => {
      const rank = e.wins === lastWins ? lastRank : idx + 1;
      out.push({ ...e, rank });
      lastWins = e.wins;
      lastRank = rank;
    });
    return out;
  })();

  return (
    <Card className="space-y-3 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{MONTH_LABEL} leaderboard</h2>
        <div className="flex items-center gap-1">
          <TabButton active={tab === 'couple'} onClick={() => setTab('couple')}>
            Couple
          </TabButton>
          <TabButton active={tab === 'global'} onClick={() => setTab('global')}>
            Global
          </TabButton>
        </div>
      </div>

      {tab === 'couple' ? (
        loading ? (
          <p className="text-sm text-textSecondary">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-textSecondary">No wins this month yet.</p>
        ) : (
          <ul className="divide-y divide-white/50">
            {withRanks.map((entry) => (
              <li key={entry.userId}>
                <button
                  type="button"
                  onClick={() => navigate(`/users/${entry.userId}`)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors',
                    'hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    entry.isYou && 'bg-accent/10'
                  )}
                >
                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-textSecondary">
                    {entry.rank}
                  </span>
                  <Avatar className="h-7 w-7 shrink-0">
                    {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">{initialsFor(entry.displayName)}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 truncate font-semibold">
                    {entry.displayName || 'Player'}
                    {entry.isYou && <span className="ml-1 text-xs text-accent">(you)</span>}
                  </p>
                  <span className="shrink-0 text-sm tabular-nums text-textSecondary">
                    {entry.wins} {entry.wins === 1 ? 'win' : 'wins'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : loading ? (
        <p className="text-sm text-textSecondary">Loading…</p>
      ) : globalCoupleEntries.length === 0 ? (
        <p className="text-sm text-textSecondary">No couples with paired solves this month yet.</p>
      ) : (
        <ul className="divide-y divide-white/50">
          {globalCoupleEntries.map((entry, idx) => (
            <li key={entry.coupleId}>
              <button
                type="button"
                onClick={() => setOpenCouple(entry)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors',
                  'hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  entry.isMine && 'bg-accent/10'
                )}
              >
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-textSecondary">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <CouplePill
                    coupleId={entry.coupleId}
                    themeColor={entry.themeColor}
                    memberNames={entry.members.map((m) => m.displayName)}
                    isMine={entry.isMine}
                  />
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums text-textSecondary">
                  <div className="text-sm font-semibold text-textPrimary">
                    Avg {entry.avgGuesses.toFixed(2)}
                  </div>
                  <div>
                    {entry.overlapCount} {entry.overlapCount === 1 ? 'solve' : 'solves'} together
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CoupleMonthlyModal entry={openCouple} onOpenChange={(o) => !o && setOpenCouple(null)} />
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-textSecondary hover:text-textPrimary'
      )}
    >
      {children}
    </button>
  );
}

function initialsFor(name: string): string {
  return (
    (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || '?'
  );
}
