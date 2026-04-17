import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { linkCouple } from '@/lib/couples';

interface Props {
  coupleName?: string;
  coupleId?: string;
  userEmail?: string;
}

export function CoupleLinkCard({ coupleName, coupleId, userEmail }: Props) {
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const shareText = coupleId
    ? `Join me on Couples Wordle: ${window.location.origin}/?invite=${coupleId}`
    : `Invite me on Couples Wordle! ${window.location.origin}`;

  const sendInvite = async () => {
    const res = await linkCouple(contact);
    setStatus(res?.message ?? 'Invite prepared. Copy & send manually.');
  };

  return (
    <Card className="space-y-2 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-textSecondary">Couple account</p>
          <p className="font-heading text-base font-semibold">
            {coupleName ?? 'Not linked yet'}
          </p>
        </div>
        {coupleId && <span className="text-xs text-accent">ID: {coupleId.slice(0, 6)}…</span>}
      </div>
      <div className="space-y-2">
        <Input
          placeholder="Partner email or phone to invite"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          type="text"
        />
        <div className="flex gap-2">
          <Button onClick={sendInvite} disabled={!contact} className="flex-1">
            Prepare invite
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(shareText);
              setStatus('Copied share text — paste into your text/iMessage.');
            }}
            className="flex-1"
          >
            Copy text
          </Button>
        </div>
        {status && <p className="text-xs text-success">{status}</p>}
        <p className="text-xs text-textSecondary">We don’t auto-send SMS; copy the text and send from Messages.</p>
      </div>
    </Card>
  );
}
