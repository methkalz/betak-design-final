/**
 * تسعيرة المالك 6.8.2026 - محسوبةً باليد ومثبَّتة هنا.
 *
 * كل رقم في هذا الملف نطقه المالك، والحساب اليدوي مكتوب بجانبه. أي انحراف
 * أغورةٍ واحدة يعني عرض سعر خاطئًا يوقّعه زبون.
 */
import { test, expect } from 'bun:test';

import { buildSeed } from '@/data/seed';
import { priceWindow } from './pricing';
import type { WindowUnit } from '@/types/domain';

const db = buildSeed();
const V = (sku: string) => db.fabricVariants.find((v) => v.sku === sku)!;
const P = (id: string) => db.fabricProducts.find((p) => p.id === id)!;

/** شباك بعرض 100 سم = متر طولي واحد، فتُقرأ كل الأرقام «لكل متر». */
function oneMeter(over: Partial<WindowUnit>, fabricSku: string, liningSku: string | null) {
  const variant = V(fabricSku);
  const lining = liningSku ? V(liningSku) : null;
  return priceWindow({
    window: {
      id: 'w', organizationId: 'o', projectId: 'p', roomId: 'r', name: 'ش',
      widthCm: 100, heightCm: 280, model: 'wave', hasLining: !!lining,
      track: 'standard', fullness: 3, quantity: 1,
      fabricVariantId: variant.id, liningVariantId: lining?.id ?? null,
      notes: '', measuredAt: null, measuredBy: null,
      ...over,
    } as WindowUnit,
    product: P(variant.productId),
    variant,
    liningVariant: lining,
    rules: db.pricingRules,
    settings: db.settings,
  });
}

const costOf = (r: ReturnType<typeof priceWindow>, label: string) =>
  r.costLines.find((l) => l.label.startsWith(label))?.amountAgorot ?? 0;

test('الكريب: 14 للمتر × 3 أمتار لكل متر طولي = 42', () => {
  const r = oneMeter({}, 'CRG-WHITE', 'LN-70');
  expect(r.runningMeters).toBe(1);
  expect(costOf(r, 'كريب')).toBe(4200);
});

test('البشتان: 20 للمتر × 3 = 60', () => {
  const r = oneMeter({}, 'BSH-BEIGE', 'LN-70');
  expect(costOf(r, 'بشتان')).toBe(6000);
});

test('بطانة 70%: 9 للمتر × 3 أمتار = 27', () => {
  const r = oneMeter({}, 'CRG-WHITE', 'LN-70');
  expect(r.liningMeters).toBe(3);
  expect(costOf(r, 'البطانة')).toBe(2700);
});

test('بطانة 100%: 30 للمتر × متر ونصف = 45، ونصف أمتار السبعين', () => {
  const r = oneMeter({}, 'CRG-WHITE', 'LN-100');
  expect(r.liningMeters).toBe(1.5);
  expect(costOf(r, 'البطانة')).toBe(4500);
});

test('نسبة البطانة لا تتبع المضاعف - تغييره لا يحرّكها', () => {
  // القماش يتبع المضاعف (14×2=28)، والبطانة تبقى على نسبتها هي
  const r = oneMeter({ fullness: 2 }, 'CRG-WHITE', 'LN-100');
  expect(costOf(r, 'كريب')).toBe(2800);
  expect(r.liningMeters).toBe(1.5);
  expect(costOf(r, 'البطانة')).toBe(4500);
});

test('التركيب 15 للمتر مهما كان القماش أو المسار', () => {
  for (const [f, l] of [['CRG-WHITE', 'LN-70'], ['BSH-WHITE', 'LN-100']] as const) {
    for (const track of ['standard', 'motorized'] as const) {
      expect(costOf(oneMeter({ track }, f, l), 'القياس والتركيب')).toBe(1500);
    }
  }
});

test('المسار العادي: 10 تكلفة ولا زيادة على الزبون', () => {
  const r = oneMeter({}, 'CRG-WHITE', 'LN-70');
  expect(costOf(r, 'مسار عادي')).toBe(1000);
  expect(r.unitPriceAgorot).toBe(29000); // 290 كما هي
});

test('المسار الكهربائي: 100 تكلفة و200 زيادة على المتر للزبون', () => {
  const r = oneMeter({ track: 'motorized' }, 'CRG-WHITE', 'LN-70');
  expect(costOf(r, 'مسار كهربائي')).toBe(10000);
  expect(r.unitPriceAgorot).toBe(49000); // 290 + 200
});

test('الماتور وجهاز التحكم: مبلغ للستارة لا للمتر', () => {
  const std = oneMeter({}, 'CRG-WHITE', 'LN-70');
  const mot = oneMeter({ track: 'motorized' }, 'CRG-WHITE', 'LN-70');
  // الزبون: (290 + 200) × متر واحد + 900 ماتور + 200 جهاز = 1,590
  expect(mot.lineTotalAgorot).toBe(159000);
  // التكلفة تزيد بفرق المسار (100−10) + الماتور 400 + الجهاز 100 = 590
  expect(mot.internalCostAgorot - std.internalCostAgorot).toBe(9000 + 40000 + 10000);
  expect(costOf(mot, 'ماتور')).toBe(40000); // 400 شيكل
  expect(costOf(mot, 'جهاز تحكم')).toBe(10000); // 100 شيكل
});

test('ستارتان كهربائيتان = ماتوران وجهازا تحكم', () => {
  const one = oneMeter({ track: 'motorized' }, 'CRG-WHITE', 'LN-70');
  const two = oneMeter({ track: 'motorized', quantity: 2 }, 'CRG-WHITE', 'LN-70');
  // الفرق يشمل مترًا إضافيًا بسعره + ماتورًا وجهازًا ثانيين
  expect(two.lineTotalAgorot - one.lineTotalAgorot).toBe(49000 + 90000 + 20000);
});

test('المسار العادي لا يُضيف ماتورًا ولا جهازًا', () => {
  const r = oneMeter({}, 'CRG-WHITE', 'LN-70');
  expect(r.costLines.some((l) => l.label === 'ماتور')).toBe(false);
  expect(r.costLines.some((l) => l.label === 'جهاز تحكم')).toBe(false);
});

test('التكلفة الكاملة لمتر كريب مع بطانة 70% ومسار عادي', () => {
  // 42 قماش + 27 بطانة + 40 خياط + 10 مسار + 10 توصيل + 15 تركيب = 144
  const r = oneMeter({}, 'CRG-WHITE', 'LN-70');
  expect(r.internalCostAgorot).toBe(14400);
});
