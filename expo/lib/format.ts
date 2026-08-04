/**
 * Formatting helpers. All money is handled in agorot (1 ILS = 100 agorot).
 */

const AR = 'ar-EG';

export function agorotToShekel(agorot: number): number {
  return agorot / 100;
}

export function shekelToAgorot(shekel: number): number {
  return Math.round(shekel * 100);
}

/** `₪1,240` — no decimals when the amount is whole, otherwise two. */
export function money(agorot: number, opts?: { compact?: boolean }): string {
  const value = agorotToShekel(agorot);
  if (opts?.compact && Math.abs(value) >= 1000) {
    return `₪${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  const hasFraction = Math.abs(value % 1) > 0.001;
  return `₪${value.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Meters with up to 3 decimals, trimmed. قرار مالك: «متر» كاملة لا «م». */
export function meters(value: number, unit = true): string {
  const rounded = Math.round(value * 1000) / 1000;
  const text = rounded.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return unit ? `${text} متر` : text;
}

export function cm(value: number): string {
  return `${Math.round(value * 100) / 100} سم`;
}

export function percent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayName(iso: string): string {
  const d = new Date(iso);
  return DAYS_AR[d.getDay()] ?? '';
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const suffix = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDate(iso)} • ${formatTime(iso)}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return formatDate(iso);
}

export function isSameDay(a: string, b: Date): boolean {
  const d = new Date(a);
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
}

export { AR };
