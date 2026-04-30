import { useEffect, useState } from 'react';
import { fetchDailyQuote, type DailyQuote } from '@/lib/dailyQuote';

const FALLBACK: DailyQuote = {
  id: 'fallback',
  text: 'Today is a good day to be exactly where you are.',
  attribution: null
};

export default function Daily() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--brand-mist))] via-[hsl(var(--brand-white))] to-[hsl(var(--brand-sage))]/30 p-6">
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
    </div>
  );
}
