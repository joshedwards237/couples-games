import { useEffect, useState } from 'react';

// Detect iOS Safari A2HS instructions (since there is no prompt).
export function useA2HS() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/.test(window.navigator.userAgent.toLowerCase());
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && isSafari && !isStandalone) {
      setShouldShow(true);
    }
  }, []);

  return { shouldShow, dismiss: () => setShouldShow(false) };
}
