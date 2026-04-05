/**
 * Thin wrapper around `mode-watcher` that persists the user's theme choice
 * in a first-party cookie (`pl_theme`) so the server hook can render the
 * correct `<html class="dark">` on SSR and avoid a flash on first paint.
 */
import { browser } from '$app/environment';
import { mode, setMode as setModeWatcher } from 'mode-watcher';

export type ThemeMode = 'light' | 'dark' | 'system';

const COOKIE_NAME = 'pl_theme';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeCookie(value: ThemeMode): void {
  if (!browser) return;
  // httpOnly and Secure are intentionally omitted: this is a client-side write
  // and the theme preference is non-sensitive.
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

export function getMode(): ThemeMode {
  // mode-watcher exposes `mode` as a Svelte store; we only read the current value synchronously.
  const current = browser
    ? document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
    : 'system';
  return current;
}

export function setMode(next: ThemeMode): void {
  setModeWatcher(next);
  writeCookie(next);
  if (!browser) return;
  const root = document.documentElement;
  if (next === 'dark') {
    root.classList.add('dark');
  } else if (next === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}

export function toggleMode(): void {
  const current = getMode();
  setMode(current === 'dark' ? 'light' : 'dark');
}

export { mode };
