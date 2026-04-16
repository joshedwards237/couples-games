import { supabase } from './supabase';

export async function linkCouple(partnerEmailOrPhone: string) {
  // Attempt RPC if exists; otherwise return message for manual send.
  try {
    const { data, error } = await supabase.rpc('link_couple', { partner_contact: partnerEmailOrPhone });
    if (error) throw error;
    return data ?? { message: 'Invite created.' };
  } catch (e) {
    console.warn('linkCouple fallback', e);
    return { message: 'Copy the text and send manually.' };
  }
}
