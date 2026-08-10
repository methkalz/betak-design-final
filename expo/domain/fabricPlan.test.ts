/**
 * قواعد التخصيص التلقائي للقماش.
 *
 * هذه القواعد تحرّك مخزونًا حقيقيًا عند كل اعتماد عرض، وخطؤها لا يُرى على
 * الشاشة بل في رولٍ نقص أو ستارةٍ خرجت بدفعتَي صبغ. تُشغَّل مع `bun test`.
 */
import { test, expect } from 'bun:test';

import {
  finishedWindowIds,
  pickRolls,
  projectFabricGaps,
  projectFabricPlan,
  windowFabricNeed,
} from './fabricPlan';
import type { Database } from '@/data/seed';

type Movement = { id: string; rollId: string; type: string; quantityM: number };

/** أصغر قاعدة تكفي هذه الدوال - البقية لا تُقرأ هنا. */
function makeDb(opts: {
  rolls: { id: string; variantId: string; onHand: number; reserved?: number }[];
  windows?: {
    id: string;
    widthCm: number;
    quantity: number;
    fullness: number;
    fabricVariantId: string | null;
    hasLining?: boolean;
    liningVariantId?: string | null;
  }[];
  reservations?: { id: string; rollId: string; quantityM: number; status?: string }[];
  usages?: { id: string; windowId: string | null; actualM: number }[];
}): Database {
  const movements: Movement[] = [];
  for (const r of opts.rolls) {
    movements.push({ id: `mv-in-${r.id}`, rollId: r.id, type: 'receipt', quantityM: r.onHand });
    if (r.reserved) {
      movements.push({
        id: `mv-rs-${r.id}`,
        rollId: r.id,
        type: 'reservation',
        quantityM: r.reserved,
      });
    }
  }
  return {
    fabricRolls: opts.rolls.map((r) => ({ id: r.id, variantId: r.variantId })),
    stockMovements: movements,
    windows: (opts.windows ?? []).map((w) => ({ ...w, projectId: 'p1', hasLining: !!w.hasLining })),
    reservations: (opts.reservations ?? []).map((r) => ({
      ...r,
      projectId: 'p1',
      status: r.status ?? 'active',
    })),
    fabricVariants: [
      { id: 'v1', productId: 'pr1', colorName: 'رملي' },
      { id: 'v2', productId: 'pr1', colorName: 'زيتي' },
    ],
    fabricProducts: [{ id: 'pr1', name: 'كتان' }],
    usages: (opts.usages ?? []).map((u) => ({ ...u, projectId: 'p1' })),
  } as unknown as Database;
}

test('رولٌ واحد يكفي يُفضَّل على التوزيع - وحدة دفعة الصبغ', () => {
  const db = makeDb({
    rolls: [
      { id: 'r1', variantId: 'v1', onHand: 8 },
      { id: 'r2', variantId: 'v1', onHand: 30 },
      { id: 'r3', variantId: 'v1', onHand: 12 },
    ],
  });
  const picks = pickRolls(db, 'v1', 10);
  expect(picks.length).toBe(1);
  // أضيق الرولات الكافية (12) لا الأكبر (30): الكبير يبقى لمشروع أكبر
  expect(picks[0]).toEqual({ rollId: 'r3', meters: 10 });
});

test('حين لا يكفي رولٌ وحده تُوزَّع الكمية على الأكبر فالأكبر', () => {
  const db = makeDb({
    rolls: [
      { id: 'r1', variantId: 'v1', onHand: 6 },
      { id: 'r2', variantId: 'v1', onHand: 9 },
      { id: 'r3', variantId: 'v1', onHand: 4 },
    ],
  });
  const picks = pickRolls(db, 'v1', 14);
  expect(picks).toEqual([
    { rollId: 'r2', meters: 9 },
    { rollId: 'r1', meters: 5 },
  ]);
});

test('المخزون غير الكافي يعني لا حجز إطلاقًا - لا حجزًا جزئيًا', () => {
  const db = makeDb({
    rolls: [
      { id: 'r1', variantId: 'v1', onHand: 6 },
      { id: 'r2', variantId: 'v1', onHand: 5 },
    ],
  });
  expect(pickRolls(db, 'v1', 20)).toEqual([]);
});

test('المحجوز مسبقًا يخصم من المتاح فلا يُحجز مرتين', () => {
  const db = makeDb({ rolls: [{ id: 'r1', variantId: 'v1', onHand: 20, reserved: 16 }] });
  // المتاح 4 فقط رغم أن الرصيد الفعلي 20
  expect(pickRolls(db, 'v1', 10)).toEqual([]);
  expect(pickRolls(db, 'v1', 4)).toEqual([{ rollId: 'r1', meters: 4 }]);
});

test('الخطة تجمع الشبابيك المتشابهة وتحسب البطانة صنفًا مستقلًا', () => {
  const db = makeDb({
    rolls: [],
    windows: [
      { id: 'w1', widthCm: 200, quantity: 1, fullness: 2, fabricVariantId: 'v1' },
      { id: 'w2', widthCm: 150, quantity: 2, fullness: 2, fabricVariantId: 'v1' },
      {
        id: 'w3',
        widthCm: 100,
        quantity: 1,
        fullness: 2.5,
        fabricVariantId: 'v2',
        hasLining: true,
        liningVariantId: 'v1',
      },
    ],
  });
  const plan = projectFabricPlan(db, 'p1');
  const v1 = plan.find((p) => p.variantId === 'v1');
  const v2 = plan.find((p) => p.variantId === 'v2');
  // 4 + 6 من الستائر + 2.5 من البطانة
  expect(v1?.meters).toBe(12.5);
  expect(v2?.meters).toBe(2.5);
});

test('حاجة الشباك من قماشه لا تشمل بطانته - البطانة صنف مستقلّ', () => {
  const db = makeDb({
    rolls: [],
    windows: [
      {
        id: 'w1',
        widthCm: 250,
        quantity: 2,
        fullness: 2,
        fabricVariantId: 'v2',
        hasLining: true,
        liningVariantId: 'v1',
      },
    ],
  });
  // 2.5 م × قطعتين × مضاعف 2 = 10 - والبطانة لا تُضاف هنا
  expect(windowFabricNeed(db, 'w1')).toBe(10);
  expect(windowFabricNeed(db, 'لا-وجود-له')).toBe(0);
});

test('المنجز يُقرأ من سجل الاستهلاك لا من خانة على الشباك', () => {
  const db = makeDb({
    rolls: [],
    windows: [
      { id: 'w1', widthCm: 100, quantity: 1, fullness: 2, fabricVariantId: 'v1' },
      { id: 'w2', widthCm: 100, quantity: 1, fullness: 2, fabricVariantId: 'v1' },
    ],
    // شريحتان لشباك واحد (رولان) تُحسبان مرة واحدة، والاستهلاك العام
    // غير المنسوب لشباك لا يجعل أي شباك منجزًا
    usages: [
      { id: 'u1', windowId: 'w1', actualM: 1 },
      { id: 'u2', windowId: 'w1', actualM: 1 },
      { id: 'u3', windowId: null, actualM: 5 },
    ],
  });
  const done = finishedWindowIds(db, 'p1');
  expect(done.size).toBe(1);
  expect(done.has('w1')).toBe(true);
  expect(done.has('w2')).toBe(false);
});

test('الفجوة = المطلوب ناقص المحجوز، والحجز المفكوك لا يُحتسب', () => {
  const db = makeDb({
    rolls: [{ id: 'r1', variantId: 'v1', onHand: 30, reserved: 4 }],
    windows: [{ id: 'w1', widthCm: 500, quantity: 1, fullness: 2, fabricVariantId: 'v1' }],
    reservations: [
      { id: 'res1', rollId: 'r1', quantityM: 4 },
      { id: 'res2', rollId: 'r1', quantityM: 7, status: 'released' },
    ],
  });
  const [gap] = projectFabricGaps(db, 'p1');
  expect(gap.required).toBe(10);
  expect(gap.reserved).toBe(4);
  expect(gap.remaining).toBe(6);
  expect(gap.available).toBe(26);
});
