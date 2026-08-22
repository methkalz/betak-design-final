/**
 * دفاتر الطاقم - أرقامٌ تُدفع بها رواتب، فخطؤها ليس خطأ عرض.
 * تُشغَّل مع `bun test`.
 */
import { test, expect } from 'bun:test';

import { checkSchedule, staffBalance, tailorAccruals, windowTailorFeeAgorot } from './staffLedger';
import { round3, runningMeters } from '@/domain/pricing';
import type { Database } from '@/data/seed';

function makeDb(over: Partial<Database>): Database {
  return {
    settings: { fieldVisitWageAgorot: 15000, oversizeSurchargePercent: 30 },
    profiles: [],
    windows: [],
    fabricVariants: [],
    fabricProducts: [],
    pricingRules: [
      // standard/crepe_with_lining: أجرة الخياط 40₪ للمتر
      { id: 'r1', band: 'standard', category: 'crepe_with_lining', customerPricePerMeterAgorot: 29000, tailorCostPerMeterAgorot: 4000 },
      { id: 'r2', band: 'tall', category: 'other_with_lining', customerPricePerMeterAgorot: 51000, tailorCostPerMeterAgorot: 7000 },
    ],
    tailorAssignments: [],
    fieldVisits: [],
    staffLedger: [],
    ...over,
  } as unknown as Database;
}

test('مستحق الشباك = أجرة المتر حسب الشريحة × أمتاره، مقعَّدًا للشيكل', () => {
  const db = makeDb({
    fabricProducts: [{ id: 'p1', kind: 'crepe' }, { id: 'p2', kind: 'other' }] as never,
    fabricVariants: [
      { id: 'v1', productId: 'p1' },
      { id: 'v2', productId: 'p2' },
    ] as never,
    windows: [
      // 3.2 م × 40₪ = 128₪
      { id: 'w1', widthCm: 320, heightCm: 300, quantity: 1, hasLining: true, fabricVariantId: 'v1' },
      // كسور تُقعَّد: 1.55 م × 40₪ = 62.0 → 62₪
      { id: 'w2', widthCm: 155, heightCm: 200, quantity: 1, hasLining: true, fabricVariantId: 'v1' },
      // فوق 800 سم: تسعير خاص - لا مستحق تلقائيًا
      { id: 'w3', widthCm: 300, heightCm: 860, quantity: 1, hasLining: true, fabricVariantId: 'v1' },
      // ★ 500 سم بالضبط: الخياط يقبض بالمعدَّل المُزاد 70+30% = 91₪
      //   3.0 م × 91₪ = 273₪ (قماشٌ «آخر» ليطابق قاعدة tall/other_with_lining)
      { id: 'w4', widthCm: 300, heightCm: 500, quantity: 1, hasLining: true, fabricVariantId: 'v2' },
      // 499: تحت الحدّ بسنتيمتر - بلا زيادة. 3.0 م × 70₪ = 210₪
      { id: 'w5', widthCm: 300, heightCm: 499, quantity: 1, hasLining: true, fabricVariantId: 'v2' },
    ] as never,
  });
  expect(windowTailorFeeAgorot(db, 'w1')).toBe(12800);
  expect(windowTailorFeeAgorot(db, 'w2')).toBe(6200);
  expect(windowTailorFeeAgorot(db, 'w3')).toBe(0);
  expect(windowTailorFeeAgorot(db, 'w4')).toBe(27300);
  expect(windowTailorFeeAgorot(db, 'w5')).toBe(21000);
});

test('الاستحقاق عن الورشات الجاهزة فقط، والرصيد جارٍ يقبل السالب', () => {
  const db = makeDb({
    fabricProducts: [{ id: 'p1', kind: 'crepe' }] as never,
    fabricVariants: [{ id: 'v1', productId: 'p1' }] as never,
    windows: [
      { id: 'w1', projectId: 'pr1', widthCm: 200, heightCm: 300, quantity: 1, hasLining: true, fabricVariantId: 'v1' },
      { id: 'w2', projectId: 'pr2', widthCm: 400, heightCm: 300, quantity: 1, hasLining: true, fabricVariantId: 'v1' },
    ] as never,
    tailorAssignments: [
      { id: 'a1', tailorId: 't1', projectId: 'pr1', stage: 'ready', completedAt: '2026-07-01T10:00:00Z' },
      // قيد التنفيذ: لا يدخل المستحق
      { id: 'a2', tailorId: 't1', projectId: 'pr2', stage: 'sewing', completedAt: null },
    ] as never,
    staffLedger: [
      // دفعة + سلفة تسبق الاستحقاق (M15)
      { id: 'l1', staffId: 't1', amountAgorot: 5000, note: '', createdBy: 'admin', createdAt: '2026-07-02T10:00:00Z' },
      { id: 'l2', staffId: 't1', amountAgorot: 10000, note: 'سلفة', createdBy: 'admin', createdAt: '2026-07-03T10:00:00Z' },
    ] as never,
  });
  const acc = tailorAccruals(db, 't1');
  expect(acc.length).toBe(1);
  expect(acc[0].feeAgorot).toBe(8000); // 2م × 40₪
  const bal = staffBalance(db, 't1', 'tailor');
  expect(bal.accruedAgorot).toBe(8000);
  expect(bal.paidAgorot).toBe(15000);
  expect(bal.balanceAgorot).toBe(-7000); // بالسالب لصالح المعرض
});

test('أجرة الميداني: زيارات مكتملة × أجرة الزيارة', () => {
  const db = makeDb({
    fieldVisits: [
      { id: 'v1', assigneeId: 'f1', projectId: 'p', status: 'completed', completedAt: '2026-07-01T10:00:00Z' },
      { id: 'v2', assigneeId: 'f1', projectId: 'p', status: 'completed', completedAt: '2026-07-02T10:00:00Z' },
      { id: 'v3', assigneeId: 'f1', projectId: 'p', status: 'scheduled', completedAt: null },
      { id: 'v4', assigneeId: 'other', projectId: 'p', status: 'completed', completedAt: '2026-07-02T10:00:00Z' },
    ] as never,
  });
  const bal = staffBalance(db, 'f1', 'field');
  expect(bal.accruedAgorot).toBe(30000); // 2 × 150₪
  expect(bal.itemsCount).toBe(2);
});

test('جدول الشيكات: اليوم يثبت والشهر الأقصر يُقصّ ولا يفيض', () => {
  const dates = checkSchedule('2026-01-31T10:00:00.000Z', 4).map((iso) => {
    const d = new Date(iso);
    return `${d.getDate()}.${d.getMonth() + 1}`;
  });
  expect(dates).toEqual(['31.1', '28.2', '31.3', '30.4']);
});

test('جدول الشيكات من منتصف الشهر يبقى على يومه', () => {
  const dates = checkSchedule('2026-08-15T10:00:00.000Z', 3).map((iso) => {
    const d = new Date(iso);
    return `${d.getDate()}.${d.getMonth() + 1}`;
  });
  expect(dates).toEqual(['15.8', '15.9', '15.10']);
});

/**
 * ★ أمتارُ الدفتر هي أمتارُ المحرّك بالضبط.
 *
 * كان الدفتر يحسب `round3((widthCm/100) × qty)` بالعائم بينما يحسب المحرّك
 * ألفياتٍ صحيحة. القسمةُ على مئة تهبط تحت نصف الألف حيث يصعد المسار الصحيح -
 * 104.35/100 يقرؤه العائم دون 1.0435 - فيقرأ الدفتر 1.043 والمحرّك 1.044.
 *
 * ليس فرقَ عرضٍ: بين 100 و600 سم، **356 عرضًا** يفقد فيها الخياط شيكلًا كاملًا
 * من أجره. ولا مرآةَ في SQL تكشفه - هذا الحساب يعيش على العميل وحده.
 *
 * الأرقام حرفيّة لا مشتقّة من الدالّة المفحوصة، والمعدَّل 91₪ (70 مُزادًا 30%)
 * لأن المعدّلات الصغيرة تبتلع الفرقَ في التقعيد فلا تميّز شيئًا.
 */
test('أمتار دفتر الطاقم = أمتار المحرّك، والفرق شيكلٌ في جيب الخياط', () => {
  const win = (widthCm: number, quantity: number) =>
    makeDb({
      fabricProducts: [{ id: 'p2', kind: 'other' }] as never,
      fabricVariants: [{ id: 'v2', productId: 'p2' }] as never,
      windows: [{
        id: 'wx', widthCm, heightCm: 500, quantity,
        hasLining: true, fabricVariantId: 'v2',
      }] as never,
    });

  // 104.35سم ×1: المحرّك 1.044م × 91₪ = 95.00₪ - والمسار العائم كان يعطي 94₪
  expect(windowTailorFeeAgorot(win(104.35, 1), 'wx')).toBe(9500);
  // 100.35سم ×3: المحرّك 3.011م × 91₪ = 274.00₪ - والعائم 273₪
  expect(windowTailorFeeAgorot(win(100.35, 3), 'wx')).toBe(27400);

  // وأن الحالتين مميِّزتان أصلًا: لولا اختلاف المسارين لما أثبت الاختبار شيئًا
  for (const [w, q] of [[104.35, 1], [100.35, 3]] as [number, number][]) {
    expect(runningMeters(w, q)).not.toBe(round3((w / 100) * q));
  }
});
