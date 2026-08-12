let counter = 0;

/** Collision-safe enough id for local-first records and idempotency keys. */
export function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function idempotencyKey(): string {
  return uid('idem');
}

/**
 * UUID v4 لمفاتيح idempotency الخادمية: الخادم يشترط النوع uuid، والفرادة
 * هنا تحصينٌ من التكرار لا سرّية - فمولّد Math.random يكفي ولا يستدعي
 * تبعية تشفير.
 */
export function uuidv4(): string {
  let out = '';
  for (let i = 0; i < 32; i++) {
    const r = (Math.random() * 16) | 0;
    if (i === 12) out += '4';
    else if (i === 16) out += ((r & 3) | 8).toString(16);
    else out += r.toString(16);
    if (i === 7 || i === 11 || i === 15 || i === 19) out += '-';
  }
  return out;
}
