import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/Layout';
import { usePranks } from '@/context/PrankContext';
import { PRANK_DEFS, type PrankSettings, type PrankDef } from '@/lib/pranks';
import { fetchAllProfiles } from '@/lib/profiles';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PrankDashboard() {
  const { isAdmin, loading, error, config, updateConfig, addExemption, removeExemption } = usePranks();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const grouped = useMemo(
    () => ({
      instant: PRANK_DEFS.filter((d) => d.category === 'instant'),
      'slow-burn': PRANK_DEFS.filter((d) => d.category === 'slow-burn'),
      narrative: PRANK_DEFS.filter((d) => d.category === 'narrative')
    }),
    []
  );

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAllProfiles();
        if (!cancelled) setProfiles(rows);
      } catch (e) {
        console.error('fetchAllProfiles failed', e);
      } finally {
        if (!cancelled) setProfilesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  const handleChange = async (key: string, patch: Partial<PrankSettings>) => {
    setSaveErr(null);
    try {
      await updateConfig(key, patch);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'save failed');
    }
  };

  const toggleExempt = async (prankKey: string, userId: string, currentlyExempt: boolean) => {
    setSaveErr(null);
    try {
      if (currentlyExempt) await removeExemption(prankKey, userId);
      else await addExemption(prankKey, userId);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'save failed');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-textSecondary">Admin</p>
          <h1 className="font-heading text-2xl font-bold">Prank dashboard</h1>
          <p className="text-sm text-textSecondary">
            Toggle pranks, tune probabilities, and exempt users. Changes save to the DB automatically.
          </p>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <p className="p-3 text-sm text-red-700">Config load error: {error}</p>
          </Card>
        )}
        {saveErr && (
          <Card className="border-red-200 bg-red-50">
            <p className="p-3 text-sm text-red-700">Save failed: {saveErr}</p>
          </Card>
        )}

        <Section title="Instant gratification" subtitle="Fires the moment a target speed-wins.">
          {grouped.instant.map((def) => (
            <PrankCard
              key={def.key}
              def={def}
              value={config[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              onChange={(p) => handleChange(def.key, p)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
            />
          ))}
        </Section>

        <Section title="Slow burn" subtitle="Queue up sabotage. Fires same session and/or next day's puzzle.">
          {grouped['slow-burn'].map((def) => (
            <PrankCard
              key={def.key}
              def={def}
              value={config[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              onChange={(p) => handleChange(def.key, p)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
            />
          ))}
        </Section>

        <Section title="Narrative gags" subtitle="Modals, fake alerts, and theatrical misdirection.">
          {grouped.narrative.map((def) => (
            <PrankCard
              key={def.key}
              def={def}
              value={config[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              onChange={(p) => handleChange(def.key, p)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
            />
          ))}
        </Section>
      </div>
    </Layout>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        <p className="text-xs text-textSecondary">{subtitle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PrankCard({
  def,
  value,
  profiles,
  profilesLoading,
  onChange,
  onToggleExempt
}: {
  def: PrankDef;
  value: PrankSettings | undefined;
  profiles: Profile[];
  profilesLoading: boolean;
  onChange: (patch: Partial<PrankSettings>) => void;
  onToggleExempt: (userId: string, wasExempt: boolean) => void;
}) {
  if (!value) return null;

  // Local slider value so dragging feels smooth — we only push to DB on release
  // (pointerup) to avoid one RPC per tick.
  const [localProb, setLocalProb] = useState(value.probability);
  useEffect(() => {
    setLocalProb(value.probability);
  }, [value.probability]);

  // Debounce threshold typing so we don't RPC on every keypress.
  const [localThreshold, setLocalThreshold] = useState(value.triggerMaxGuesses);
  useEffect(() => {
    setLocalThreshold(value.triggerMaxGuesses);
  }, [value.triggerMaxGuesses]);
  const thresholdTimer = useRef<number | null>(null);

  const [exemptOpen, setExemptOpen] = useState(false);
  const [exemptFilter, setExemptFilter] = useState('');

  const filteredProfiles = useMemo(() => {
    const q = exemptFilter.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [profiles, exemptFilter]);

  return (
    <Card className={cn('bg-white/80 backdrop-blur', !value.enabled && 'opacity-90')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{def.title}</CardTitle>
          <CardDescription>{def.description}</CardDescription>
        </div>
        <Toggle checked={value.enabled} onChange={(v) => onChange({ enabled: v })} />
      </CardHeader>

      <CardContent className={cn('space-y-4 pt-2', !value.enabled && 'pointer-events-none opacity-60')}>
        <Field label="Probability" hint={`${Math.round(localProb * 100)}% of triggers fire`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={localProb}
            onChange={(e) => setLocalProb(Number(e.target.value))}
            onPointerUp={() => {
              if (Math.abs(localProb - value.probability) > 0.001) onChange({ probability: localProb });
            }}
            onBlur={() => {
              if (Math.abs(localProb - value.probability) > 0.001) onChange({ probability: localProb });
            }}
            className="h-1 w-full appearance-none rounded-full bg-brand-dust accent-accent"
          />
        </Field>

        <Field
          label="Trigger threshold"
          hint={`Fires when win is ≤ ${localThreshold} guesses`}
        >
          <Input
            type="number"
            min={1}
            max={6}
            value={localThreshold}
            onChange={(e) => {
              const v = Math.max(1, Math.min(6, Number(e.target.value) || 1));
              setLocalThreshold(v);
              if (thresholdTimer.current) window.clearTimeout(thresholdTimer.current);
              thresholdTimer.current = window.setTimeout(() => onChange({ triggerMaxGuesses: v }), 400);
            }}
            className="w-24"
          />
        </Field>

        {def.category === 'slow-burn' && (
          <Field label="Fires on">
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label="Same session"
                checked={!!value.fireSameSession}
                onChange={(v) => onChange({ fireSameSession: v })}
              />
              <Checkbox
                label="Next day's puzzle"
                checked={!!value.fireNextDay}
                onChange={(v) => onChange({ fireNextDay: v })}
              />
            </div>
          </Field>
        )}

        <Field
          label="Exempt users"
          hint={
            value.exemptUserIds.length === 0
              ? 'Nobody exempted — everyone (except admins) is fair game.'
              : `${value.exemptUserIds.length} exempted`
          }
        >
          <button
            type="button"
            onClick={() => setExemptOpen((v) => !v)}
            className="w-full rounded-md border border-brand-sage/40 bg-white/60 px-3 py-2 text-left text-sm hover:bg-white/80"
          >
            {exemptOpen ? 'Hide picker' : 'Manage exemptions'}
          </button>

          {exemptOpen && (
            <div className="mt-2 space-y-2 rounded-md border border-brand-sage/30 bg-white/70 p-3">
              <Input
                placeholder="Filter by name…"
                value={exemptFilter}
                onChange={(e) => setExemptFilter(e.target.value)}
              />
              {profilesLoading ? (
                <p className="text-xs text-textSecondary">Loading users…</p>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-xs text-textSecondary">No matching users.</p>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {filteredProfiles.map((p) => {
                    const exempt = value.exemptUserIds.includes(p.userId);
                    return (
                      <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{p.displayName || '(no name)'}</span>
                        <Checkbox
                          label={exempt ? 'exempt' : 'not exempt'}
                          checked={exempt}
                          onChange={() => onToggleExempt(p.userId, exempt)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Field>
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-textSecondary">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-brand-dust'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

function Checkbox({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-brand-sage accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}
