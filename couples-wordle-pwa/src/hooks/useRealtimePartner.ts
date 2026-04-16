import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimePartner(coupleId?: string) {
  const [partnerStarted, setPartnerStarted] = useState(false);

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase.channel(`partner-started:${coupleId}`);
    channel.on('broadcast', { event: 'partner_started' }, (payload) => {
      if (payload?.payload?.couple_id === coupleId) {
        setPartnerStarted(true);
        setTimeout(() => setPartnerStarted(false), 4000);
      }
    });
    channel.subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [coupleId]);

  return partnerStarted;
}
