import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Profile } from '@/lib/types';

/**
 * Props-driven read-only variant of the IdentityCard used in /profile.
 * Renders name + avatar only — no email, no edit controls. Used by the
 * public /users/:userId page.
 */
export function IdentityCardView({ profile }: { profile: Profile }) {
  const name = (profile.displayName ?? '').trim() || 'Player';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || '?';

  return (
    <Card className="flex items-center gap-4 bg-white/80 backdrop-blur">
      <Avatar className="h-14 w-14 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
        {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-heading font-semibold truncate">{name}</p>
      </div>
    </Card>
  );
}
