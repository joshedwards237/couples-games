import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/Layout';
import { usePranks } from '@/context/PrankContext';
import { PRANK_DEFS, type PrankSettings, type PrankDef } from '@/lib/pranks';
import { fetchAllProfiles } from '@/lib/profiles';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface DirtyInfo {
  title: string;
  sections: string[];
}
type DirtyMap = Record<string, DirtyInfo>;

type Scope = 'global' | 'couple';

export function PrankDashboard() {
  const {
    isPrankAdmin,
    loading,
    error,
    globalConfig,
    config: resolvedConfig,
    coupleOverrides,
    coupleId,
    updateConfig,
    updateCoupleOverride,
    clearCoupleOverride,
    addExemption,
    removeExemption
  } = usePranks();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState<DirtyMap>({});
  // Default to 'couple' when the admin has a couple; otherwise fall back
  // to 'global'. The `My couple` tab hides entirely when there's no couple.
  const [scope, setScope] = useState<Scope>(coupleId ? 'couple' : 'global');

  // If coupleId lands after first render, flip to couple view.
  useEffect(() => {
    if (coupleId && scope === 'global') setScope('couple');
    if (!coupleId && scope === 'couple') setScope('global');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId]);

  const grouped = useMemo(
    () => ({
      instant: PRANK_DEFS.filter((d) => d.category === 'instant'),
      'slow-burn': PRANK_DEFS.filter((d) => d.category === 'slow-burn'),
      narrative: PRANK_DEFS.filter((d) => d.category === 'narrative')
    }),
    []
  );

  useEffect(() => {
    if (!isPrankAdmin) return;
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
  }, [isPrankAdmin]);

  const reportDirty = useCallback((key: string, info: DirtyInfo | null) => {
    setDirty((prev) => {
      if (!info) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      const existing = prev[key];
      if (
        existing &&
        existing.title === info.title &&
        existing.sections.length === info.sections.length &&
        existing.sections.every((s, i) => s === info.sections[i])
      ) {
        return prev;
      }
      return { ...prev, [key]: info };
    });
  }, []);

  const dirtyEntries = Object.entries(dirty);
  const hasDirty = dirtyEntries.length > 0;

  // Warn on browser-level navigation (reload, close, URL change) when there
  // are unsaved changes. Modern browsers ignore the custom string but will
  // show their standard "Leave site?" prompt when preventDefault is called.
  useEffect(() => {
    if (!hasDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDirty]);

  // Warn on in-app navigation (clicks on <a href="/..."> that react-router
  // intercepts — e.g. the Layout "Back" link). Runs in the capture phase
  // so we can cancel the click before react-router handles it.
  useEffect(() => {
    if (!hasDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement | null)?.closest?.('a');
      if (!el) return;
      const href = el.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      if (href === window.location.pathname) return;
      const msg = 'You have unsaved prank changes. Leave without saving?';
      if (!window.confirm(msg)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [hasDirty]);

  if (!loading && !isPrankAdmin) return <Navigate to="/" replace />;

  // Per-scope value map rendered by each PrankCard. In couple mode we show
  // the RESOLVED values (merged) so the admin sees what their couple will
  // actually get; saves capture the entire draft as an explicit override.
  const valuesForScope = scope === 'global' ? globalConfig : resolvedConfig;

  const handleSave = async (key: string, next: Partial<PrankSettings>) => {
    setSaveErr(null);
    try {
      if (scope === 'global') {
        await updateConfig(key, next);
      } else {
        // All five draft fields are in `next` (PrankCard always sends the
        // full set). Writing them explicitly locks the override so
        // subsequent global changes don't bleed into this couple.
        await updateCoupleOverride(key, {
          enabled: next.enabled,
          probability: next.probability,
          triggerMaxGuesses: next.triggerMaxGuesses,
          fireSameSession: next.fireSameSession,
          fireNextDay: next.fireNextDay
        });
      }
    } catch (e: any) {
      setSaveErr(e?.message ?? 'save failed');
      throw e;
    }
  };

  const handleClearOverride = async (key: string) => {
    setSaveErr(null);
    try {
      await clearCoupleOverride(key);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'reset failed');
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
            {scope === 'global'
              ? 'Global defaults applied to every couple unless explicitly overridden.'
              : 'Overrides for your couple. Unset fields inherit from Global. Click Save to lock all five fields as an override.'}
            {' '}Exemption toggles save immediately.
          </p>
        </div>

        {coupleId && (
          <div className="flex gap-1 rounded-md border border-brand-sage/30 bg-white/60 p-1 text-sm">
            <button
              type="button"
              onClick={() => setScope('couple')}
              className={cn(
                'flex-1 rounded px-3 py-1.5 font-semibold transition',
                scope === 'couple' ? 'bg-accent text-white shadow-sm' : 'text-textSecondary hover:bg-white/80'
              )}
            >
              My couple
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={cn(
                'flex-1 rounded px-3 py-1.5 font-semibold transition',
                scope === 'global' ? 'bg-accent text-white shadow-sm' : 'text-textSecondary hover:bg-white/80'
              )}
            >
              Global defaults
            </button>
          </div>
        )}

        {hasDirty && (
          <Card className="sticky top-2 z-10 border-amber-300 bg-amber-50/95 shadow-md backdrop-blur">
            <CardContent className="py-3">
              <p className="text-sm font-semibold text-amber-900">
                Unsaved changes in {dirtyEntries.length} {dirtyEntries.length === 1 ? 'prank' : 'pranks'}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-900/90">
                {dirtyEntries.map(([k, info]) => (
                  <li key={k}>
                    <span className="font-medium">{info.title}</span>
                    {info.sections.length > 0 && (
                      <span className="text-amber-900/70"> — {info.sections.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

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
              key={`${scope}:${def.key}`}
              def={def}
              value={valuesForScope[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              scope={scope}
              hasOverride={scope === 'couple' && !!coupleOverrides[def.key]}
              onSave={(patch) => handleSave(def.key, patch)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
              onDirtyChange={(info) => reportDirty(def.key, info)}
              onClearOverride={scope === 'couple' ? () => handleClearOverride(def.key) : undefined}
            />
          ))}
        </Section>

        <Section title="Slow burn" subtitle="Queue up sabotage. Fires same session and/or next day's puzzle.">
          {grouped['slow-burn'].map((def) => (
            <PrankCard
              key={`${scope}:${def.key}`}
              def={def}
              value={valuesForScope[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              scope={scope}
              hasOverride={scope === 'couple' && !!coupleOverrides[def.key]}
              onSave={(patch) => handleSave(def.key, patch)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
              onDirtyChange={(info) => reportDirty(def.key, info)}
              onClearOverride={scope === 'couple' ? () => handleClearOverride(def.key) : undefined}
            />
          ))}
        </Section>

        <Section title="Narrative gags" subtitle="Modals, fake alerts, and theatrical misdirection.">
          {grouped.narrative.map((def) => (
            <PrankCard
              key={`${scope}:${def.key}`}
              def={def}
              value={valuesForScope[def.key]}
              profiles={profiles}
              profilesLoading={profilesLoading}
              scope={scope}
              hasOverride={scope === 'couple' && !!coupleOverrides[def.key]}
              onSave={(patch) => handleSave(def.key, patch)}
              onToggleExempt={(uid, was) => toggleExempt(def.key, uid, was)}
              onDirtyChange={(info) => reportDirty(def.key, info)}
              onClearOverride={scope === 'couple' ? () => handleClearOverride(def.key) : undefined}
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
  scope,
  hasOverride,
  onSave,
  onToggleExempt,
  onDirtyChange,
  onClearOverride
}: {
  def: PrankDef;
  value: PrankSettings | undefined;
  profiles: Profile[];
  profilesLoading: boolean;
  scope: Scope;
  hasOverride: boolean;
  onSave: (patch: Partial<PrankSettings>) => Promise<void>;
  onToggleExempt: (userId: string, wasExempt: boolean) => void;
  onDirtyChange: (info: { title: string; sections: string[] } | null) => void;
  onClearOverride?: () => void;
}) {
  const [draftEnabled, setDraftEnabled] = useState(value?.enabled ?? false);
  const [draftProb, setDraftProb] = useState(value?.probability ?? 1);
  // String to allow the field to be empty during editing; parsed at save time.
  const [draftThreshold, setDraftThreshold] = useState(String(value?.triggerMaxGuesses ?? 2));
  const [draftSameSession, setDraftSameSession] = useState(!!value?.fireSameSession);
  const [draftNextDay, setDraftNextDay] = useState(!!value?.fireNextDay);

  const [saving, setSaving] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const [exemptFilter, setExemptFilter] = useState('');

  // Re-sync draft when persisted value changes from outside (post-save or
  // another admin edited concurrently). Skipped while our own save is in
  // flight so optimistic update + DB echo don't double-fire.
  useEffect(() => {
    if (!value || saving) return;
    setDraftEnabled(value.enabled);
    setDraftProb(value.probability);
    setDraftThreshold(String(value.triggerMaxGuesses));
    setDraftSameSession(!!value.fireSameSession);
    setDraftNextDay(!!value.fireNextDay);
  }, [
    value?.enabled,
    value?.probability,
    value?.triggerMaxGuesses,
    value?.fireSameSession,
    value?.fireNextDay,
    saving,
    value
  ]);

  const thresholdTrimmed = draftThreshold.trim();
  const thresholdNum = Number(thresholdTrimmed);
  const thresholdError =
    thresholdTrimmed === ''
      ? 'Required (1–6)'
      : !Number.isInteger(thresholdNum) || thresholdNum < 1 || thresholdNum > 6
        ? 'Must be a whole number between 1 and 6'
        : null;

  const dirtyFields = useMemo(() => {
    if (!value) return [] as string[];
    const out: string[] = [];
    if (draftEnabled !== value.enabled) out.push(draftEnabled ? 'Enabled' : 'Disabled');
    if (Math.abs(draftProb - value.probability) > 0.001) out.push('Probability');
    if (thresholdTrimmed !== String(value.triggerMaxGuesses)) out.push('Threshold');
    if (draftSameSession !== !!value.fireSameSession) out.push('Same session');
    if (draftNextDay !== !!value.fireNextDay) out.push('Next day');
    return out;
  }, [value, draftEnabled, draftProb, thresholdTrimmed, draftSameSession, draftNextDay]);

  const isDirty = dirtyFields.length > 0;
  const canSave = isDirty && !thresholdError && !saving;

  useEffect(() => {
    onDirtyChange(isDirty ? { title: def.title, sections: dirtyFields } : null);
  }, [isDirty, dirtyFields, def.title, onDirtyChange]);

  // Stop reporting dirty when this card unmounts, so a stale entry doesn't
  // linger in the parent's banner.
  useEffect(() => {
    return () => onDirtyChange(null);
  }, [onDirtyChange]);

  if (!value) return null;

  const discard = () => {
    setDraftEnabled(value.enabled);
    setDraftProb(value.probability);
    setDraftThreshold(String(value.triggerMaxGuesses));
    setDraftSameSession(!!value.fireSameSession);
    setDraftNextDay(!!value.fireNextDay);
  };

  const save = async () => {
    if (!canSave || thresholdError) return;
    setSaving(true);
    try {
      await onSave({
        enabled: draftEnabled,
        probability: draftProb,
        triggerMaxGuesses: thresholdNum,
        fireSameSession: draftSameSession,
        fireNextDay: draftNextDay
      });
    } catch {
      /* error surfaced by parent; keep local draft so user can retry */
    } finally {
      setSaving(false);
    }
  };

  const filteredProfiles = (() => {
    const q = exemptFilter.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.displayName.toLowerCase().includes(q));
  })();

  return (
    <Card
      className={cn(
        'bg-white/80 backdrop-blur',
        !draftEnabled && 'opacity-90',
        isDirty && 'ring-2 ring-amber-300/70'
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{def.title}</CardTitle>
            {isDirty && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                Unsaved
              </span>
            )}
            {scope === 'couple' && hasOverride && !isDirty && (
              <span
                title="This couple has an explicit override for this prank"
                className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
              >
                Override
              </span>
            )}
            {scope === 'couple' && !hasOverride && !isDirty && (
              <span
                title="Inherited from Global defaults"
                className="inline-flex items-center rounded-full bg-brand-dust px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-textSecondary"
              >
                Inherited
              </span>
            )}
          </div>
          <CardDescription>{def.description}</CardDescription>
        </div>
        <Toggle checked={draftEnabled} onChange={setDraftEnabled} dirty={draftEnabled !== value.enabled} />
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        <div className={cn('space-y-4', !draftEnabled && 'pointer-events-none opacity-60')}>
        <Field
          label="Probability"
          hint={`${Math.round(draftProb * 100)}% of triggers fire`}
          dirty={Math.abs(draftProb - value.probability) > 0.001}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draftProb}
            onChange={(e) => setDraftProb(Number(e.target.value))}
            className="h-1 w-full appearance-none rounded-full bg-brand-dust accent-accent"
          />
        </Field>

        <Field
          label="Trigger threshold"
          hint={
            thresholdError
              ? undefined
              : `Fires when win is ≤ ${thresholdNum} ${thresholdNum === 1 ? 'guess' : 'guesses'}`
          }
          dirty={thresholdTrimmed !== String(value.triggerMaxGuesses)}
        >
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draftThreshold}
            onChange={(e) => {
              // Allow empty string and any digits. Validation happens in
              // the error derivation below so typing 7 doesn't get silently
              // clamped to 6 — the user gets to fix it themselves.
              const raw = e.target.value;
              if (raw === '' || /^\d+$/.test(raw)) setDraftThreshold(raw);
            }}
            className="w-24"
            aria-invalid={!!thresholdError}
          />
          {thresholdError && <p className="text-xs text-red-600">{thresholdError}</p>}
        </Field>

        {def.category === 'slow-burn' && (
          <Field
            label="Fires on"
            dirty={draftSameSession !== !!value.fireSameSession || draftNextDay !== !!value.fireNextDay}
          >
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label="Same session"
                checked={draftSameSession}
                onChange={setDraftSameSession}
              />
              <Checkbox
                label="Next day's puzzle"
                checked={draftNextDay}
                onChange={setDraftNextDay}
              />
            </div>
          </Field>
        )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-sage/20 pt-3">
          {scope === 'couple' && hasOverride && onClearOverride ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearOverride}
              disabled={saving}
              className="text-textSecondary"
            >
              Reset to global
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={discard} disabled={!isDirty || saving}>
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave}>
              {saving ? 'Saving…' : scope === 'couple' ? 'Save override' : 'Save'}
            </Button>
          </div>
        </div>

        <Field
          label="Exempt users"
          hint={
            value.exemptUserIds.length === 0
              ? 'Nobody exempted — everyone (except admins) is fair game. Saves immediately.'
              : `${value.exemptUserIds.length} exempted · saves immediately`
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

function Field({
  label,
  hint,
  children,
  dirty = false
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  dirty?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold">{label}</p>
          {dirty && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved" />}
        </div>
        {hint && <p className="text-xs text-textSecondary">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  dirty = false
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  dirty?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {dirty && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved" />}
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
    </div>
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
