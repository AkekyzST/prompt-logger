/**
 * SSR-safe time formatters. Both functions are deterministic given their
 * inputs so the server-rendered HTML matches what the client produces on
 * hydration — no timezone drift, no `new Date()` side effects.
 */

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * `YYYY-MM-DD HH:mm` in UTC. Returns the input unchanged if it fails to parse.
 */
export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/**
 * Human-relative label (just now / N min ago / N h ago / yesterday / N d ago).
 * Falls back to {@link formatAbsolute} after 7 days. Pure function: pass a
 * `now` to keep unit tests deterministic.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return formatAbsolute(iso);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} d ago`;

  return formatAbsolute(iso);
}
