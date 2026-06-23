// Light/Dark theme: applied via a `dark` class on <html>. Persisted locally for
// instant load and synced to the user's account (prefs) for cross-device.
import { api } from './api.js';

const KEY = 'po_theme';

export function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}
export function getTheme() {
  return localStorage.getItem(KEY) || 'light';
}
export function setTheme(t) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
  api.put('/prefs/theme', { value: t }).catch(() => {});
}
// Apply the stored theme immediately, then reconcile with the server copy.
export function initTheme() {
  applyTheme(getTheme());
  api.get('/prefs/theme').then((r) => {
    if (r && (r.value === 'light' || r.value === 'dark') && r.value !== getTheme()) {
      localStorage.setItem(KEY, r.value); applyTheme(r.value);
    }
  }).catch(() => {});
}
