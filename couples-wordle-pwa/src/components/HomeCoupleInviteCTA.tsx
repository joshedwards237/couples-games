import { useEffect, useState } from 'react';
import { Heart, Link as LinkIcon, Copy, Check, Share2, LogOut, Loader2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { buildInviteUrl, createCouple, fetchMyCouple, leaveCouple } from '@/lib/couples';
import type { MyCouple } from '@/lib/types';

/**
 * Home-page CTA nudging unlinked users to start a couple. Three states:
 *   - no couple     → "Invite your partner" button; click creates the
 *                     couple row and flips to 'pending'
 *   - pending (1)   → shows the invite link + Copy/Share + Cancel
 *   - linked (2)    → null (card disappears)
 *
 * Fetch on mount + whenever `refreshKey` changes (so callers can trigger
 * a re-read after a partner joins via the InviteBanner).
 */
interface Props {
  refreshKey?: number;
}

export function HomeCoupleInviteCTA({ refreshKey = 0 }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [couple, setCouple] = useState<MyCouple | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!user) {
      setCouple(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const mine = await fetchMyCouple(user.id);
        if (!cancelled) setCouple(mine);
      } catch (e) {
        console.error('HomeCoupleInviteCTA fetchMyCouple failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshKey]);

  // While auth/couple state is resolving, render nothing — avoids a flash
  // of the CTA for users who turn out to be linked.
  if (loading || !user) return null;

  const linked = !!couple && couple.members.length >= 2;
  if (linked) return null;

  const pending = !!couple && couple.members.length < 2;
  const inviteUrl = pending && couple ? buildInviteUrl(couple.couple.id) : null;

  const startInvite = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createCouple(null);
      if (!user) return;
      const mine = await fetchMyCouple(user.id);
      setCouple(mine);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Could not create invite');
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async () => {
    setBusy(true);
    setErr(null);
    try {
      await leaveCouple();
      setCouple(null);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Could not cancel invite');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShare = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.share({ text: `Join me on Couples Wordle: ${inviteUrl}`, url: inviteUrl });
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error(e);
    }
  };

  if (!pending) {
    return (
      <Card className="space-y-3 border-accent/40 bg-white/80 backdrop-blur">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-accent" />
            Play with your partner
          </CardTitle>
          <CardDescription>
            Link two accounts to compare results, share streaks, and show up on each
            other&apos;s leaderboard.
          </CardDescription>
        </CardHeader>
        <Button onClick={startInvite} disabled={busy} className="w-full">
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating invite…
            </span>
          ) : (
            'Invite your partner'
          )}
        </Button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3 border-accent/40 bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="h-4 w-4 text-accent" />
          Waiting on your partner
        </CardTitle>
        <CardDescription>
          Send them this link. It opens their sign-in flow and auto-links your
          accounts.
        </CardDescription>
      </CardHeader>
      {inviteUrl && (
        <div className="flex items-center gap-2 rounded-md border border-white/60 bg-white/70 px-3 py-2">
          <LinkIcon className="h-4 w-4 shrink-0 text-textSecondary" />
          <span className="flex-1 truncate text-sm">{inviteUrl}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleCopy} disabled={busy}>
          {copied ? <Check /> : <Copy />}
          <span>{copied ? 'Copied' : 'Copy link'}</span>
        </Button>
        {canShare && (
          <Button onClick={handleShare} disabled={busy}>
            <Share2 />
            <span>Share</span>
          </Button>
        )}
        <Button variant="ghost" onClick={cancelInvite} disabled={busy} className="ml-auto">
          <LogOut />
          <span>{busy ? 'Canceling…' : 'Cancel invite'}</span>
        </Button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </Card>
  );
}
