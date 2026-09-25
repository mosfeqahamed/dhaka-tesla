// Money arrives as integer paisa (৳1 = 100 paisa) and is only turned into
// taka for display, never for arithmetic.
export function formatTaka(paisa: number): string {
  const sign = paisa < 0 ? '−' : '';
  const abs = Math.abs(paisa);
  const taka = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}৳${taka}.${rest}`;
}

export function formatDistance(metres: number): string {
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
