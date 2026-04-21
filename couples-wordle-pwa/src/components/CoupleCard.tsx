import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Check, Copy, Link as LinkIcon, Loader2, LogOut, Share2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import {
  buildInviteUrl,
  createCouple,
  fetchMyCouple,
  leaveCouple,
  updateCoupleThemeColor
} from '@/lib/couples';
import { COUPLE_COLOR_PALETTE, isValidHexColor, resolveCoupleColor } from '@/lib/coupleColors';
import { cn } from '@/lib/utils';
import type { MyCouple } from '@/lib/types';

export function CoupleCard() {
  const { user } = useAuth();
  const [state, setState] = useState<'loading' | 'unlinked' | 'pending' | 'linked' | 'error'>('loading');
  const [couple, setCouple] = useState<MyCouple | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setState('loading');
      try {
        const mine = await fetchMyCouple(user.id);
        if (cancelled) return;
        if (!mine) {
          setCouple(null);
          setState('unlinked');
        } else {
          setCouple(mine);
          setState(mine.members.length >= 2 ? 'linked' : 'pending');
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error(e);
          setErr(e?.message ?? 'Could not load couple');
          setState('error');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const startInvite = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createCouple(null);
      if (!user) return;
      const mine = await fetchMyCouple(user.id);
      setCouple(mine);
      setState(mine && mine.members.length >= 2 ? 'linked' : 'pending');
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Could not create invite');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    setErr(null);
    try {
      await leaveCouple();
      setCouple(null);
      setState('unlinked');
      setConfirmLeaveOpen(false);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Could not leave couple');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShare = async (url: string) => {
    try {
      await navigator.share({ text: `Join me on Couples Wordle: ${url}`, url });
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error(e);
    }
  };

  if (state === 'loading') {
    return (
      <Card className="bg-white/80 backdrop-blur">
        <p className="flex items-center gap-2 text-sm text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading couple…
        </p>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card className="border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{err}</p>
      </Card>
    );
  }

  if (state === 'unlinked') {
    return (
      <Card className="space-y-3 bg-white/80 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle>Invite your partner</CardTitle>
          <CardDescription>
            Link two accounts so you can compare results and see each other&apos;s plays on the leaderboard.
          </CardDescription>
        </CardHeader>
        <Button onClick={startInvite} disabled={busy} className="w-full">
          {busy ? 'Creating…' : 'Create invite link'}
        </Button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </Card>
    );
  }

  if (!couple) return null;

  const url = buildInviteUrl(couple.couple.id);
  const me = couple.members.find((m) => m.userId === user?.id);
  const partner = couple.members.find((m) => m.userId !== user?.id);

  if (state === 'pending') {
    return (
      <Card className="space-y-3 bg-white/80 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle>Waiting for your partner</CardTitle>
          <CardDescription>Send them this link. It opens their account flow and auto-links.</CardDescription>
        </CardHeader>
        <div className="flex items-center gap-2 rounded-md border border-white/60 bg-white/70 px-3 py-2">
          <LinkIcon className="h-4 w-4 shrink-0 text-textSecondary" />
          <span className="flex-1 truncate text-sm">{url}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleCopy(url)}>
            {copied ? <Check /> : <Copy />}
            <span>{copied ? 'Copied' : 'Copy link'}</span>
          </Button>
          {canShare && (
            <Button onClick={() => handleShare(url)}>
              <Share2 />
              <span>Share</span>
            </Button>
          )}
          <Button variant="ghost" onClick={handleLeave} disabled={busy} className="ml-auto">
            <LogOut />
            <span>Cancel invite</span>
          </Button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </Card>
    );
  }

  // state === 'linked'
  // Fall back through: profile display_name → Google full_name/name →
  // email local-part → generic label. Same chain the IdentityCard uses.
  const meName = meaningfulName(me?.displayName) ?? selfFallbackName(user) ?? 'You';
  const partnerName = meaningfulName(partner?.displayName) ?? 'Your partner';

  return (
    <Card className="space-y-2 bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle>Linked with {meaningfulName(partner?.displayName) ?? 'your partner'}</CardTitle>
        <CardDescription>
          You&apos;re playing as a couple. Both of your results appear on today&apos;s leaderboard.
        </CardDescription>
      </CardHeader>
      <div className="flex items-center gap-4 text-sm">
        <MemberTile label="You" name={meName} avatarUrl={selfAvatar(user) ?? me?.avatarUrl ?? null} />
        <span className="text-textSecondary">·</span>
        {partner?.userId ? (
          <RouterLink
            to={`/users/${partner.userId}`}
            className="-m-2 rounded-md p-2 transition-colors hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={`View ${partnerName}'s profile`}
          >
            <MemberTile label="Partner" name={partnerName} avatarUrl={partner.avatarUrl ?? null} />
          </RouterLink>
        ) : (
          <MemberTile label="Partner" name={partnerName} avatarUrl={partner?.avatarUrl ?? null} />
        )}
      </div>
      <ThemeColorPicker
        coupleId={couple.couple.id}
        stored={couple.couple.themeColor}
        onSaved={(color) => setCouple((c) => (c ? { ...c, couple: { ...c.couple, themeColor: color } } : c))}
      />

      <Button
        variant="ghost"
        onClick={() => setConfirmLeaveOpen(true)}
        disabled={busy}
        className="w-fit"
      >
        <LogOut />
        <span>Leave couple</span>
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}

      <Dialog open={confirmLeaveOpen} onOpenChange={(o) => !busy && setConfirmLeaveOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Leave couple with {meaningfulName(partner?.displayName) ?? 'your partner'}?
            </DialogTitle>
            <DialogDescription>
              You&apos;ll both need to re-link via a fresh invite to play as a couple again. Your
              individual stats and history stay put.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmLeaveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave couple'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Returns `name` if it's a non-empty trimmed string, otherwise null. */
function meaningfulName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fallback chain for the current user's own name when their profile
 * display_name is empty: Google `full_name` → `name` → email local-part.
 */
function selfFallbackName(user: { user_metadata?: unknown; email?: string | null } | null): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromGoogle =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    '';
  if (fromGoogle) return fromGoogle as string;
  if (user.email && user.email.includes('@')) return user.email.split('@')[0];
  return null;
}

/**
 * Current user's OAuth avatar as a fast-path while the profiles row
 * might still be backfilling. Falls back to the stored profile avatar.
 */
function selfAvatar(user: { user_metadata?: unknown } | null): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    '';
  return raw || null;
}

function initialsFor(name: string): string {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  const initials = parts
    .map((p) => (Array.from(p)[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
  return initials || '?';
}

function ThemeColorPicker({
  coupleId,
  stored,
  onSaved
}: {
  coupleId: string;
  stored: string | null;
  onSaved: (color: string | null) => void;
}) {
  const resolved = resolveCoupleColor(coupleId, stored);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const effective = pending ?? stored;
  const effectiveHex = isValidHexColor(effective) ? effective : resolved.color;

  const save = async (next: string | null) => {
    setPending(next ?? '');
    setErr(null);
    try {
      await updateCoupleThemeColor(next);
      onSaved(next);
    } catch (e: any) {
      console.error('save couple theme color failed', e);
      setErr(e?.message ?? 'Could not save color');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-2 rounded-md bg-white/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Couple theme</p>
        {resolved.isDefault && !stored && (
          <span className="text-[10px] uppercase tracking-wider text-textSecondary">auto</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {COUPLE_COLOR_PALETTE.map((c) => {
          const selected = effectiveHex.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={`Use ${c}`}
              onClick={() => save(c)}
              className={cn(
                'h-6 w-6 rounded-full border-2 transition-transform',
                selected ? 'scale-110 border-textPrimary' : 'border-white/70 hover:scale-105'
              )}
              style={{ backgroundColor: c }}
            />
          );
        })}
        <label
          className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-textSecondary/60 text-[10px] font-bold text-textSecondary"
          title="Pick custom color"
        >
          <input
            type="color"
            value={effectiveHex}
            onChange={(e) => save(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span aria-hidden="true">+</span>
        </label>
        {stored && (
          <button
            type="button"
            onClick={() => save(null)}
            className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary"
          >
            Reset
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function MemberTile({
  label,
  name,
  avatarUrl
}: {
  label: string;
  name: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar className="h-9 w-9 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-xs">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-textSecondary">{label}</p>
        <p className="truncate font-semibold">{name}</p>
      </div>
    </div>
  );
}
