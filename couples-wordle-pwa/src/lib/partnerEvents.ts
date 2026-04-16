import { supabase } from './supabase';

export function broadcastPartnerStarted(coupleId: string) {
  const channel = supabase.channel(`partner-started:${coupleId}`);
  // Fire-and-forget broadcast that partner is starting.
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({ type: 'broadcast', event: 'partner_started', payload: { couple_id: coupleId } });
      setTimeout(() => channel.unsubscribe(), 5000);
    }
  });
}
