import { supabase } from './supabase';

// Bundle version — Vite injects via import.meta.env.VITE_APP_VERSION
// if set, else fall back to build timestamp encoded at config time.
const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'unknown';

const SESSION_KEY = 'cwp.session_id';
const QUEUE_KEY = 'cwp.error_queue';
const MAX_QUEUE = 25;
const MAX_FIELD = 8_000;

type ErrorSource =
  | 'window.onerror'
  | 'unhandledrejection'
  | 'react_error_boundary'
  | 'manual';

type ErrorRow = {
  user_id: string | null;
  session_id: string;
  name: string;
  message: string;
  stack: string | null;
  url: string;
  user_agent: string;
  app_version: string;
  source: ErrorSource;
  extra: Record<string, unknown> | null;
};

let installed = false;
// Re-entrance guard: if the logger itself throws, do not recurse.
let insideLogger = false;

function getSessionId(): string {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 64);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'no-storage';
  }
}

function truncate(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) : s;
}

function serialize(err: unknown): { name: string; message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message || String(err),
      stack: err.stack ?? null
    };
  }
  if (typeof err === 'string') return { name: 'String', message: err, stack: null };
  try {
    return { name: 'Unknown', message: JSON.stringify(err), stack: null };
  } catch {
    return { name: 'Unknown', message: String(err), stack: null };
  }
}

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function pushToQueue(row: ErrorRow): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const arr: ErrorRow[] = raw ? JSON.parse(raw) : [];
    arr.push(row);
    while (arr.length > MAX_QUEUE) arr.shift();
    localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

async function flushQueue(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(QUEUE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let arr: ErrorRow[] = [];
  try {
    arr = JSON.parse(raw);
  } catch {
    try { localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
    return;
  }
  if (arr.length === 0) return;
  try {
    const { error } = await supabase.from('client_errors').insert(arr);
    if (!error) {
      try { localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
    }
  } catch {
    /* keep in queue for next boot */
  }
}

export async function logError(
  err: unknown,
  opts: { source?: ErrorSource; extra?: Record<string, unknown> } = {}
): Promise<void> {
  if (insideLogger) return;
  insideLogger = true;
  try {
    const { name, message, stack } = serialize(err);
    const row: ErrorRow = {
      user_id: await getUserId(),
      session_id: getSessionId(),
      name: truncate(name) ?? 'Error',
      message: truncate(message) ?? 'unknown',
      stack: truncate(stack),
      url: typeof window !== 'undefined' ? window.location.href : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      app_version: APP_VERSION,
      source: opts.source ?? 'manual',
      extra: opts.extra ?? null
    };

    try {
      const { error } = await supabase.from('client_errors').insert(row);
      if (error) pushToQueue(row);
    } catch {
      pushToQueue(row);
    }
  } catch {
    /* swallow — never throw from the logger */
  } finally {
    insideLogger = false;
  }
}

/**
 * Install global handlers once. Safe to call multiple times.
 * Also flushes any queued errors from a prior session.
 */
export function installErrorLogging(): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (ev) => {
    const err = ev.error ?? ev.message ?? 'window.onerror';
    void logError(err, {
      source: 'window.onerror',
      extra: {
        filename: (ev as ErrorEvent).filename,
        lineno: (ev as ErrorEvent).lineno,
        colno: (ev as ErrorEvent).colno
      }
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    void logError(ev.reason ?? 'unhandledrejection', { source: 'unhandledrejection' });
  });

  // Flush any errors from a prior session that couldn't reach Supabase.
  void flushQueue();
}
