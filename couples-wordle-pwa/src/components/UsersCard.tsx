import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  adminDeleteUser,
  adminListUsers,
  adminSetAppAdminRole,
  adminSetPrankAdminRole,
  type AdminUser
} from '@/lib/adminUsers';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 8;

type Confirm =
  | { kind: 'toggle-app-admin'; user: AdminUser; enabled: boolean }
  | { kind: 'toggle-prank-admin'; user: AdminUser; enabled: boolean }
  | { kind: 'delete'; user: AdminUser };

export function UsersCard() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const rows = await adminListUsers();
      setUsers(rows);
    } catch (e: any) {
      console.error('admin_list_users failed', e);
      setError(e?.message ?? 'Could not load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    // Reset to page 0 whenever the filter changes, so results don't disappear
    // onto an empty page.
    setPage(0);
  }, [query]);

  const apply = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'toggle-app-admin') {
        await adminSetAppAdminRole(confirm.user.userId, confirm.enabled);
      } else if (confirm.kind === 'toggle-prank-admin') {
        await adminSetPrankAdminRole(confirm.user.userId, confirm.enabled);
      } else if (confirm.kind === 'delete') {
        await adminDeleteUser(confirm.user.userId);
      }
      setConfirm(null);
      setDeleteText('');
      await load();
    } catch (e: any) {
      console.error('admin user op failed', e);
      setError(e?.message ?? 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Users</CardTitle>
        <CardDescription>
          Manage roles and remove accounts. Changes take effect immediately across all sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading ? (
          <p className="text-sm text-textSecondary">Loading users…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-textSecondary">
            {query ? 'No matches.' : 'No users yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-white/50">
            {visible.map((u) => (
              <UserRow
                key={u.userId}
                user={u}
                isSelf={me?.id === u.userId}
                onToggleAppAdmin={(enabled) =>
                  setConfirm({ kind: 'toggle-app-admin', user: u, enabled })
                }
                onTogglePrankAdmin={(enabled) =>
                  setConfirm({ kind: 'toggle-prank-admin', user: u, enabled })
                }
                onDelete={() => setConfirm({ kind: 'delete', user: u })}
              />
            ))}
          </ul>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-1 text-xs text-textSecondary">
            <span>
              Page {safePage + 1} of {totalPages} · {filtered.length} users
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        confirm={confirm}
        busy={busy}
        deleteText={deleteText}
        onDeleteTextChange={setDeleteText}
        onConfirm={apply}
        onCancel={() => {
          setConfirm(null);
          setDeleteText('');
        }}
      />
    </Card>
  );
}

function UserRow({
  user,
  isSelf,
  onToggleAppAdmin,
  onTogglePrankAdmin,
  onDelete
}: {
  user: AdminUser;
  isSelf: boolean;
  onToggleAppAdmin: (enabled: boolean) => void;
  onTogglePrankAdmin: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const initials = initialsFor(user.displayName || user.email);
  const joined = formatDate(user.createdAt);

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-semibold">
              {user.displayName || '(no name)'}
              {isSelf && <span className="ml-1 text-xs text-accent">(you)</span>}
            </p>
            {user.isAppAdmin && <RolePill label="App admin" tone="accent" />}
            {user.isPrankAdmin && <RolePill label="Prank admin" tone="amber" />}
          </div>
          <p className="truncate text-xs text-textSecondary">{user.email}</p>
          <p className="text-xs text-textSecondary">
            {user.couple ? (
              <>
                <span>In couple</span>
                {user.couple.partnerDisplayName ? (
                  <> with <span className="font-semibold">{user.couple.partnerDisplayName}</span></>
                ) : (
                  <> (partner pending)</>
                )}
              </>
            ) : (
              <span>No couple</span>
            )}
            <span> · Joined {joined}</span>
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleAppAdmin(!user.isAppAdmin)}
          disabled={isSelf && user.isAppAdmin}
          title={isSelf && user.isAppAdmin ? 'Cannot demote yourself' : undefined}
        >
          {user.isAppAdmin ? 'Revoke app admin' : 'Make app admin'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onTogglePrankAdmin(!user.isPrankAdmin)}>
          {user.isPrankAdmin ? 'Revoke prank admin' : 'Make prank admin'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={onDelete}
          disabled={isSelf}
          title={isSelf ? 'Cannot delete yourself' : undefined}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

function RolePill({ label, tone }: { label: string; tone: 'accent' | 'amber' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'amber' && 'bg-amber-100 text-amber-800'
      )}
    >
      {label}
    </span>
  );
}

function ConfirmDialog({
  confirm,
  busy,
  deleteText,
  onDeleteTextChange,
  onConfirm,
  onCancel
}: {
  confirm: Confirm | null;
  busy: boolean;
  deleteText: string;
  onDeleteTextChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const open = confirm !== null;
  if (!confirm) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
        <DialogContent />
      </Dialog>
    );
  }

  const { kind, user } = confirm;
  const name = user.displayName || user.email;

  if (kind === 'delete') {
    const matches = deleteText.trim().toLowerCase() === user.email.toLowerCase();
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This permanently removes their account, profile, couple membership, puzzle attempts,
              and trophies. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-textSecondary">
              Type <span className="font-mono font-semibold">{user.email}</span> to confirm.
            </p>
            <Input
              placeholder={user.email}
              value={deleteText}
              onChange={(e) => onDeleteTextChange(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={!matches || busy}
            >
              {busy ? 'Deleting…' : 'Delete user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const toggleOn = kind === 'toggle-app-admin' ? confirm.enabled : confirm.enabled;
  const roleLabel = kind === 'toggle-app-admin' ? 'app admin' : 'prank admin';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {toggleOn ? `Grant ${roleLabel}?` : `Revoke ${roleLabel}?`}
          </DialogTitle>
          <DialogDescription>
            {toggleOn
              ? `${name} will be able to use ${roleLabel === 'app admin' ? 'the admin panel' : 'the prank dashboard'} immediately.`
              : `${name} will lose ${roleLabel === 'app admin' ? 'admin-panel access' : 'prank dashboard access'} immediately.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initialsFor(name: string): string {
  return (
    (name || '')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || '?'
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return '—';
  }
}
