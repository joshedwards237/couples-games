import { useEffect, useRef, useState } from 'react';
import { fetchDailyQuote, type DailyQuote } from '@/lib/dailyQuote';

const FALLBACK: DailyQuote = {
  id: 'fallback',
  text: 'Today is a good day to be exactly where you are.',
  attribution: null
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function detectIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  if (!/iphone|ipad|ipod/i.test(ua)) return false;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPiOS = Opera,
  // YaBrowser = Yandex, FBAN/FBAV = Facebook, Instagram/Line/Twitter
  // are all WebKit shells where iOS A2HS share-menu doesn't surface.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|FBAN|FBAV|Instagram|Line|Twitter/i.test(ua);
}

const A2HS_DISMISSED_KEY = 'daily:a2hs-dismissed';

function wasA2HSDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(A2HS_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function persistA2HSDismissed() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(A2HS_DISMISSED_KEY, '1');
  } catch {
    /* private mode / quota — fall through, will reappear next visit */
  }
}

export default function Daily() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showA2HS, setShowA2HS] = useState(false);
  const installEvtRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDailyQuote()
      .then((q) => {
        if (cancelled) return;
        setQuote(q ?? FALLBACK);
      })
      .catch(() => {
        if (cancelled) return;
        setQuote(FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (detectStandalone() || wasA2HSDismissed()) return;
    const t = window.setTimeout(() => setShowA2HS(true), 800);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      installEvtRef.current = e as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      installEvtRef.current = null;
      persistA2HSDismissed();
      setShowA2HS(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const isIOS = detectIOS();
  const isIOSSafari = detectIOSSafari();

  const handleHintAction = async () => {
    const evt = installEvtRef.current;
    if (evt) {
      try {
        await evt.prompt();
        const choice = await evt.userChoice;
        if (choice.outcome === 'accepted') setShowA2HS(false);
        installEvtRef.current = null;
      } catch {
        /* swallow — user can dismiss via X */
      }
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Daily Quote',
          url: window.location.href
        });
      } catch {
        /* user cancelled share sheet — leave hint visible */
      }
    }
  };

  return (
    <div
      className="min-h-[100svh] flex items-center justify-center bg-gradient-to-br from-[hsl(var(--brand-mist))] via-[hsl(var(--brand-white))] to-[hsl(var(--brand-sage))]/30 p-6"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        touchAction: 'manipulation'
      }}
    >
      <div
        className={`w-full max-w-xl rounded-[2rem] bg-[hsl(var(--brand-white))]/90 shadow-xl ring-1 ring-black/5 px-8 py-12 md:px-12 md:py-16 text-center transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="font-handwriting text-4xl md:text-5xl leading-snug text-brand-hunter">
          &ldquo;{(quote ?? FALLBACK).text}&rdquo;
        </p>
        {(quote ?? FALLBACK).attribution && (
          <p className="font-handwriting text-2xl text-brand-fern mt-8">
            &mdash; {(quote ?? FALLBACK).attribution}
          </p>
        )}
        <p className="font-sans text-xs uppercase tracking-widest text-textSecondary mt-12">
          {today}
        </p>
      </div>

      {showA2HS && (
        <div
          className="fixed left-1/2 -translate-x-1/2 w-[min(calc(100vw-1.5rem),28rem)] rounded-2xl bg-brand-hunter/95 text-white text-sm shadow-lg backdrop-blur flex items-stretch overflow-hidden"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          role="dialog"
          aria-label="Add to Home Screen hint"
        >
          <button
            type="button"
            onClick={handleHintAction}
            className="flex-1 px-4 py-3 text-left active:bg-white/10"
          >
            {isIOSSafari ? (
              <span>
                Tap <span aria-hidden>⬆️</span> Share &rarr; <strong>Add to Home Screen</strong>
              </span>
            ) : isIOS ? (
              <span>
                <strong>Open in Safari</strong> to add this to your home screen
              </span>
            ) : (
              <span>
                Tap to <strong>install this page</strong> for a faster scan
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              persistA2HSDismissed();
              setShowA2HS(false);
            }}
            aria-label="Dismiss hint"
            className="px-3 py-3 border-l border-white/15 active:bg-white/10 text-white/80 hover:text-white"
          >
            <span aria-hidden className="text-base leading-none">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
