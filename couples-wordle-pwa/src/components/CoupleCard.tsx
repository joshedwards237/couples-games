import { useEffect, useState } from 'react';
import { Check, Copy, Link as LinkIcon, Loader2, LogOut, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { buildInviteUrl, createCouple, fetchMyCouple, leaveCouple } from '@/lib/couples';
import type { MyCouple } from '@/lib/types';

export function CoupleCard() {
  const { user } = useAuth();
  const [state, setState] = useState<'loading' | 'unlinked' | 'pending' | 'linked' | 'error'>('loading');
  const [couple, setCouple] = useState<MyCouple | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

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
  return (
    <Card className="space-y-2 bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle>Linked with {partner?.displayName || 'your partner'}</CardTitle>
        <CardDescription>
          You&apos;re playing as a couple. Both of your results appear on today&apos;s leaderboard.
        </CardDescription>
      </CardHeader>
      <div className="flex items-center gap-3 text-sm">
        <div>
          <p className="text-xs text-textSecondary">You</p>
          <p className="font-semibold">{me?.displayName || 'You'}</p>
        </div>
        <span className="text-textSecondary">·</span>
        <div>
          <p className="text-xs text-textSecondary">Partner</p>
          <p className="font-semibold">{partner?.displayName || '—'}</p>
        </div>
      </div>
      <Button variant="ghost" onClick={handleLeave} disabled={busy} className="w-fit">
        <LogOut />
        <span>Leave couple</span>
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </Card>
  );
}
