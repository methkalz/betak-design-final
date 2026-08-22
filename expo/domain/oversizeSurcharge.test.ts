/**
 * زيادة الارتفاع الكبير (قرار المالك 22.8.2026).
 *
 * من 500 سم فأكثر - شاملًا الـ500 - تُزاد ثلاثة معدّلات: سعر الزبون للمتر،
 * وأجرة الخياط، والقياس والتركيب. أرقامٌ تُطبع في عرض سعرٍ يوقّعه زبون،
 * فتُثبَّت بالحساب اليدوي.
 *
 * **لماذا هذا الملفّ ضروريّ**: المتجهات الذهبية الثمانية عمياءُ عن الارتفاع
 * (كلّها 250 سم، و`lineArithmetic` لا يستقبله أصلًا)، فلن تكشف عطبًا في
 * الزيادة إطلاقًا. وهذا هو حارسها الوحيد على جانب TS.
 *
 * وتعمّدٌ في التصميم كزيادة لون البطانة: تُجمع في `priceWindow` قبل النواة
 * الحسابية، فلا تمسّ `pricing.vectors.json` المرآة مع SQL.
 */
import { expect, test } from 'bun:test';

import { oversizeRateAgorot, priceWindow } from './pricing';
import type {
  BusinessSettings,
  FabricProduct,
  FabricVariant,
  PricingRule,
  WindowUnit,
} from '@/types/domain';

const SETTINGS = {
  trackCostPerMeterAgorot: 1000,
  deliveryCostPerMeterAgorot: 1000,
  measureInstallCostPerMeterAgorot: 1500,
  liningCostPerMeterAgorot: 900,
  vatPercent: 18,
  minMarginPercent: 35,
  oversizeSurchargePercent: 30,
} as unknown as BusinessSettings;

const PRODUCT = { id: 'p1', kind: 'crepe' } as FabricProduct;
const FABRIC = { id: 'v1', productId: 'p1', costPerMeterAgorot: 1400 } as FabricVariant;

/** أسعار المالك للشريحة العالية: الزبون 450 والخياط 70. */
const RULES = [
  { id: 'r1', band: 'tall', category: 'crepe_with_lining',
    customerPricePerMeterAgorot: 45000, tailorCostPerMeterAgorot: 7000 },
  { id: 'r2', band: 'standard', category: 'crepe_with_lining',
    customerPricePerMeterAgorot: 29000, tailorCostPerMeterAgorot: 4000 },
] as PricingRule[];

/** شباك 200 سم، قطعة واحدة، مضاعف 3 → مترّان طوليّان. */
const WIN = {
  id: 'w', organizationId: 'o', projectId: 'p', roomId: 'r', name: 'ش',
  widthCm: 200, hasLining: true, track: 'standard', fullness: 3,
  fabricVariantId: 'v1', liningVariantId: null, quantity: 1,
  notes: '', measuredAt: null, measuredBy: null,
} as unknown as WindowUnit;

const price = (heightCm: number, settings: BusinessSettings = SETTINGS) =>
  priceWindow({
    window: { ...WIN, heightCm },
    product: PRODUCT,
    variant: FABRIC,
    liningVariant: null,
    rules: RULES,
    settings,
  });

const line = (r: ReturnType<typeof price>, label: string) =>
  r.costLines.find((l) => l.label.startsWith(label))?.amountAgorot ?? 0;

/* ─────────────────────────── سلّم الحدود ─────────────────────────── */

test('499 سم: تحت الحدّ بسنتيمتر - لا زيادة إطلاقًا', () => {
  const r = price(499);
  expect(r.unitPriceAgorot).toBe(45000); // 450 كما هي
  expect(r.lineTotalAgorot).toBe(90000); // 2 م × 450
  expect(line(r, 'الخياط')).toBe(7000);
  expect(line(r, 'القياس')).toBe(1500);
});

test('500 سم بالضبط: الحدّ شاملٌ - الزيادة تسري', () => {
  const r = price(500);
  expect(r.unitPriceAgorot).toBe(58500); // 450 + 30% = 585
  expect(r.lineTotalAgorot).toBe(117000); // 2 م × 585
  expect(line(r, 'الخياط')).toBe(9100); // 70 → 91
  expect(line(r, 'القياس')).toBe(1950); // 15 → 19.50
});

test('501 و799 و800: الزيادة مستمرّة حتى السقف شاملًا', () => {
  for (const h of [501, 640, 799, 800]) {
    const r = price(h);
    expect(r.requiresAdminPricing).toBe(false);
    expect(r.unitPriceAgorot).toBe(58500);
  }
});

test('801 سم: فوق السقف - لا تسعير تلقائي', () => {
  const r = price(801);
  expect(r.requiresAdminPricing).toBe(true);
  expect(r.unitPriceAgorot).toBe(0);
  expect(r.lineTotalAgorot).toBe(0);
  expect(r.internalCostAgorot).toBe(0);
  expect(r.costLines.length).toBe(0);
  // الأمتار تبقى للمعلومة - المال وحده يغيب
  expect(r.runningMeters).toBe(2.0);
});

/* ────────────────── الثلاثة وحدها تتحرّك، لا غيرها ────────────────── */

test('القماش والمسار والتوصيل لا تُمسّ بالزيادة', () => {
  const below = price(499);
  const above = price(500);
  expect(line(above, 'كريب')).toBe(line(below, 'كريب')); // 14 × 3
  expect(line(above, 'مسار')).toBe(line(below, 'مسار')); // 10
  expect(line(above, 'التوصيل')).toBe(line(below, 'التوصيل')); // 10
  // وما يتحرّك يتحرّك فعلًا
  expect(line(above, 'الخياط')).toBeGreaterThan(line(below, 'الخياط'));
  expect(line(above, 'القياس')).toBeGreaterThan(line(below, 'القياس'));
});

test('نسبة صفر = لا أثر إطلاقًا (خاصّية التوافق الرجعيّ)', () => {
  const zero = { ...SETTINGS, oversizeSurchargePercent: 0 } as BusinessSettings;
  const a = price(500, zero);
  const b = price(499, zero);
  expect(a.unitPriceAgorot).toBe(b.unitPriceAgorot);
  expect(a.internalCostAgorot).toBe(b.internalCostAgorot);
  expect(a.unitPriceAgorot).toBe(45000);
});

/* ─────────── التقريب: المعدَّل لا المجموع، ونصفٌ بعيدًا عن الصفر ─────────── */

test('★ المعدَّل لا المجموع: شبّاك 51 سم يفرّق شيكلًا كاملًا', () => {
  // ضربُ المعدَّل: floor(round(58500 × 0.510)) → 29835 → 29800 = 298.00₪
  // ضربُ المجموع: floor(round(45000 × 0.510))=22900 ثم ×1.3 → 29700 = 297.00₪
  const r = priceWindow({
    window: { ...WIN, widthCm: 51, heightCm: 500 },
    product: PRODUCT, variant: FABRIC, liningVariant: null,
    rules: RULES, settings: SETTINGS,
  });
  expect(r.unitPriceAgorot).toBe(58500);
  expect(r.lineTotalAgorot).toBe(29800); // لا 29700
});

test('نسبة كسرية: التقريب نصفٌ بعيدًا عن الصفر - مرآةُ round(numeric)', () => {
  // 1500 × 11250 / 10000 = 1687.5 بالضبط → 1688 لا 1687.
  // عند 30٪ لا مُعدَّل واقعيّ يُنتج نصفًا، فهذه الحالة وحدها تقفل القاعدة.
  expect(oversizeRateAgorot(1500, 500, 12.5)).toBe(1688);
  // وحالاتٌ قِيست على PostgreSQL نفسه قبل كتابة الشيفرة
  expect(oversizeRateAgorot(45000, 500, 30)).toBe(58500);
  expect(oversizeRateAgorot(45000, 500, 30.25)).toBe(58613);
  expect(oversizeRateAgorot(1500, 500, 33.33)).toBe(2000);
  expect(oversizeRateAgorot(12345, 500, 30.5)).toBe(16110);
  expect(oversizeRateAgorot(999, 500, 0.5)).toBe(1004);
});

test('الدالّة لا تمسّ ما دون الحدّ مهما كانت النسبة', () => {
  for (const h of [0, 320, 499]) {
    expect(oversizeRateAgorot(45000, h, 30)).toBe(45000);
  }
});
