/**
 * زيادة البطانة على سعر المتر (قرار المالك 6.8.2026).
 *
 * البطانة 70% داخلة في السعر المحدد للمتر، و100% تزيده بما هو مسجَّل على
 * اللون. هذه أرقامٌ تُطبع في عرض سعر يوقّعه زبون، فتُثبَّت بالحساب اليدوي.
 *
 * ملاحظة تعمّدٌ في التصميم: الزيادة تُجمع في `priceWindow` قبل استدعاء
 * النواة الحسابية، فلا تمسّ متجهات `pricing.vectors.json` المرآة مع SQL.
 */
import { test, expect } from 'bun:test';

import { priceWindow } from './pricing';
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
  measureInstallCostPerMeterAgorot: 3000,
  liningCostPerMeterAgorot: 900,
  vatPercent: 18,
  minMarginPercent: 35,
} as unknown as BusinessSettings;

// كريب جورجيت، شريحة عادية: 290 للمتر مع بطانة، و240 بدونها.
// إلغاء البطانة يغيّر فئة التسعير نفسها - فالقاعدتان لازمتان للعيّنة.
const RULES: PricingRule[] = [
  {
    id: 'r1',
    organizationId: 'o',
    band: 'standard',
    category: 'crepe_with_lining',
    customerPricePerMeterAgorot: 29000,
    tailorCostPerMeterAgorot: 4000,
  },
  {
    id: 'r2',
    organizationId: 'o',
    band: 'standard',
    category: 'crepe_without_lining',
    customerPricePerMeterAgorot: 24000,
    tailorCostPerMeterAgorot: 4000,
  },
];

const PRODUCT = { id: 'p1', kind: 'crepe' } as FabricProduct;
const FABRIC = { id: 'v1', productId: 'p1', costPerMeterAgorot: 1400, customerSurchargePerMeterAgorot: 0 } as FabricVariant;
const LINING_70 = { id: 'l70', costPerMeterAgorot: 900, customerSurchargePerMeterAgorot: 0 } as FabricVariant;
const LINING_100 = { id: 'l100', costPerMeterAgorot: 900, customerSurchargePerMeterAgorot: 17000 } as FabricVariant;

/** شباك 200 سم، قطعة واحدة، مضاعف 3 → مترّان طوليّان. */
const WIN = {
  id: 'w', organizationId: 'o', projectId: 'p', roomId: 'r', name: 'ش',
  widthCm: 200, heightCm: 280, model: 'wave', hasLining: true, track: 'standard',
  fullness: 3, fabricVariantId: 'v1', liningVariantId: 'l70', quantity: 1,
  notes: '', measuredAt: null, measuredBy: null,
} as WindowUnit;

const price = (lining: FabricVariant | null, hasLining = true) =>
  priceWindow({
    window: { ...WIN, hasLining },
    product: PRODUCT,
    variant: FABRIC,
    liningVariant: lining,
    rules: RULES,
    settings: SETTINGS,
  });

test('بطانة 70% داخلة في السعر: المتر يبقى 290', () => {
  const r = price(LINING_70);
  expect(r.runningMeters).toBe(2);
  expect(r.unitPriceAgorot).toBe(29000);
  expect(r.lineTotalAgorot).toBe(58000); // 2 م × 290
});

test('بطانة 100% تزيد سعر المتر 170 فيصير 460', () => {
  const r = price(LINING_100);
  expect(r.unitPriceAgorot).toBe(46000);
  expect(r.lineTotalAgorot).toBe(92000); // 2 م × 460
  // الفرق عن 70% = الأمتار الطولية × الزيادة، لا أمتار القماش
  expect(r.lineTotalAgorot - price(LINING_70).lineTotalAgorot).toBe(2 * 17000);
});

test('الزيادة تسقط تمامًا حين لا بطانة', () => {
  // حتى لو بقي لون البطانة مسجَّلًا على الشباك، إلغاء البطانة يُسقط زيادتها
  // ويُنزل السعر إلى قاعدة «بدون بطانة» - لا 240 + 170
  const r = price(LINING_100, false);
  expect(r.unitPriceAgorot).toBe(24000);
});

test('الزيادة لا تُغيّر التكلفة الداخلية - هي إيراد لا مصروف', () => {
  expect(price(LINING_100).internalCostAgorot).toBe(price(LINING_70).internalCostAgorot);
});

test('الزيادة ترفع الهامش لأنها إيراد صافٍ فوق تكلفة ثابتة', () => {
  expect(price(LINING_100).marginPercent).toBeGreaterThan(price(LINING_70).marginPercent);
});
