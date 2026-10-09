// New-order alert tone generated with Web Audio (no audio file to download).
// Browsers only allow sound after a user interaction, so the admin UI calls unlockAudio() on first click.
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unsupported */
  }
}

export const audioReady = () => ctx?.state === 'running';

export function playAlert() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  const tones = [
    [880, 0],
    [1320, 0.18],
    [880, 0.45],
    [1320, 0.63],
  ];
  for (const [freq, at] of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.35, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.18);
  }
  return true;
}

export async function showBrowserNotification(title: string, body: string, url = '/admin/orders') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'vnd-order', data: { url } });
    else new Notification(title, { body, icon: '/icons/icon-192.png' });
  } catch {
    /* ignore */
  }
}
