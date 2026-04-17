import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';

export function UserMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl =
    (meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || undefined;
  const fullName =
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : 'Player');
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => (Array.from(p)[0] ?? '').toUpperCase())
      .slice(0, 2)
      .join('') || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2"
        >
          <Avatar className="h-10 w-10 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-0.5">
            <p className="truncate text-sm font-semibold">{fullName}</p>
            {user.email && <p className="truncate text-xs text-textSecondary">{user.email}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserIcon />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
