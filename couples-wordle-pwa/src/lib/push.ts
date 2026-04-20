import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * iOS Safari only exposes Web Push when the PWA is launched from the
 * Home Screen (display-mode: standalone). Surfacing this lets the UI
 * show targeted instructions instead of a generic "not supported".
 */
export function isIosStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (!isIos) return true; // non-iOS needs no home-screen gate
  // Safari sets navigator.standalone; modern browsers expose matchMedia.
  const legacy = (navigator as any).standalone === true;
  const modern = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;
  return legacy || modern;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  // Fall back to ready (handles cases where the page loaded before the
  // vite-plugin-pwa register ran).
  return navigator.serviceWorker.ready;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await getRegistration();
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.error('getExistingSubscription failed', err);
    return null;
  }
}

/**
 * Request permission, subscribe to push on this device, and persist the
 * subscription to Supabase. Idempotent: re-subscribing the same endpoint
 * updates the row instead of duplicating it.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('Push not supported on this device.');
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key missing (VITE_VAPID_PUBLIC_KEY).');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: lib.dom's current PushSubscriptionOptionsInit expects
      // BufferSource over a plain ArrayBuffer while our Uint8Array is
      // typed over ArrayBufferLike; browsers accept either shape.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource
    });
  }

  const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
  const authKey = arrayBufferToBase64Url(sub.getKey('auth'));

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'endpoint' }
    );
  if (error) throw error;

  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const sub = await getExistingSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch (err) {
    console.error('pushManager.unsubscribe failed', err);
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
  if (error) console.error('push_subscriptions delete failed', error);
}
