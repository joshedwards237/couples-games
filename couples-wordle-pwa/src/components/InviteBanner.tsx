import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import {
  clearPendingInvite,
  fetchMyCouple,
  getPendingInvite,
  joinCouple,
  previewCouple
} from '@/lib/couples';
import type { CouplePreview } from '@/lib/types';

type Status = 'loading' | 'ready' | 'full' | 'joining' | 'joined' | 'alreadyLinked' | 'error' | 'hidden';

interface Props {
  onJoined?: () => void;
}

export function InviteBanner({ onJoined }: Props) {
  const { user } = useAuth();
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CouplePreview | null>(null);
  const [status, setStatus] = useState<Status>('hidden');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = getPendingInvite();
    if (!id) {
      setStatus('hidden');
      return;
    }
    setInviteId(id);
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      try {
        const p = await previewCouple(id);
        if (cancelled) return;
        if (!p) {
          clearPendingInvite();
          setStatus('hidden');
          return;
        }
        setPreview(p);

        if (user) {
          const mine = await fetchMyCouple(user.id);
          if (cancelled) return;
          if (mine) {
            if (mine.couple.id === p.id) {
              clearPendingInvite();
              setStatus('hidden');
              return;
            }
            setStatus('alreadyLinked');
            return;
          }
        }

        setStatus(p.isFull ? 'full' : 'ready');
      } catch (e: any) {
        if (!cancelled) {
          console.error(e);
          setErr(e?.message ?? 'Could not load invite');
          setStatus('error');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (status === 'hidden') return null;

  const dismiss = () => {
    clearPendingInvite();
    setStatus('hidden');
  };

  const accept = async () => {
    if (!inviteId) return;
    setStatus('joining');
    setErr(null);
    try {
      await joinCouple(inviteId);
      clearPendingInvite();
      setStatus('joined');
      onJoined?.();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? 'Could not join couple');
      setStatus('error');
    }
  };

  const inviterName = preview?.creatorDisplayName?.trim() || 'Someone';

  return (
    <Card className="space-y-2 border-accent/50 bg-white/90 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-accent" />
          {status === 'joined'
            ? "You're linked!"
            : `${inviterName} invited you to a couple`}
        </CardTitle>
        {status === 'loading' && (
          <CardDescription className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading invite…
          </CardDescription>
        )}
        {status === 'ready' && !user && (
          <CardDescription>Sign in below to join.</CardDescription>
        )}
        {status === 'ready' && user && (
          <CardDescription>Accept to share results and streaks.</CardDescription>
        )}
        {status === 'full' && (
          <CardDescription>This couple is already full.</CardDescription>
        )}
        {status === 'alreadyLinked' && (
          <CardDescription>
            You&apos;re already linked with someone else. Leave your current couple first.
          </CardDescription>
        )}
        {status === 'joined' && <CardDescription>You can play together now.</CardDescription>}
        {status === 'error' && err && <CardDescription className="text-red-600">{err}</CardDescription>}
      </CardHeader>

      <div className="flex flex-wrap gap-2">
        {status === 'ready' && user && (
          <Button onClick={accept}>Accept invite</Button>
        )}
        {status === 'joining' && (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" /> Joining…
          </Button>
        )}
        {(status === 'full' || status === 'alreadyLinked' || status === 'joined' || status === 'error') && (
          <Button variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </Card>
  );
}
