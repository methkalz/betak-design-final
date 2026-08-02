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
