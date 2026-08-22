/**
 * Golden pricing vectors — TS side of the §10 point-5 contract.
 * The same vectors are asserted against SQL numeric arithmetic in
 * supabase/tests/golden_pricing_vectors.py. Any single-agora difference
 * between the two sides fails the CI gate. Run with `bun test`.
 * (Excluded from tsc via tsconfig "exclude" — bun:test types are bun's.)
 */
import { test, expect } from 'bun:test';
import { lineArithmetic, totalsArithmetic, priceWindow } from './pricing';
import type { BusinessSettings, FabricProduct, FabricVariant, PricingRule, WindowUnit } from '@/types/domain';
import vectors from './pricing.vectors.json';

const S = vectors.settings;

for (const v of vectors.vectors) {
  test(`vector: ${v.name}`, () => {
    const line = lineArithmetic({
      widthCm: v.input.widthCm,
      quantity: v.input.quantity,
      fullness: v.input.fullness,
      hasLining: v.input.hasLining,
      unitPriceAgorot: v.input.unitPriceAgorot,
      tailorCostAgorot: v.input.tailorCostAgorot,
      fabricCostAgorot: v.input.fabricCostAgorot,
      liningCostAgorot: v.input.liningCostAgorot,
      trackCostAgorot: S.trackCostPerMeterAgorot,
      deliveryCostAgorot: S.deliveryCostPerMeterAgorot,
      measureInstallCostAgorot: S.measureInstallCostPerMeterAgorot,
    });

    expect(line.runningMeters).toBe(v.expected.runningMeters);
    expect(line.fabricMeters).toBe(v.expected.fabricMeters);
    expect(line.liningMeters).toBe(v.expected.liningMeters);
    expect(line.lineTotalAgorot).toBe(v.expected.lineTotalAgorot);
    expect(line.internalCostAgorot).toBe(v.expected.internalCostAgorot);

    const t = totalsArithmetic(
      line.lineTotalAgorot,
      line.internalCostAgorot,
      v.input.discountPercent,
      S.vatPercent,
    );
    expect(t.subtotalAgorot).toBe(v.expected.subtotalAgorot);
    expect(t.discountAgorot).toBe(v.expected.discountAgorot);
    expect(t.totalAgorot).toBe(v.expected.totalAgorot);
    expect(t.vatAgorot).toBe(v.expected.vatAgorot);
    expect(t.revenueExVatAgorot).toBe(v.expected.revenueExVatAgorot);
    expect(t.marginPercent).toBe(v.expected.marginPercent);
  });
}

// فوق 800 سم: لا تسعير تلقائي — مطابقة المعاينة لمحرك SQL (يرفض BD422).
// (‏500-800 يُسعَّر بزيادة الارتفاع؛ اختبارها في oversizeSurcharge.test.ts)
test('height above 800cm gets no automatic price (requiresAdminPricing)', () => {
  const settings: BusinessSettings = {
    organizationId: 'org-1',
    trackCostPerMeterAgorot: S.trackCostPerMeterAgorot,
    deliveryCostPerMeterAgorot: S.deliveryCostPerMeterAgorot,
    measureInstallCostPerMeterAgorot: S.measureInstallCostPerMeterAgorot,
    liningCostPerMeterAgorot: 900,
    minMarginPercent: 35,
    employeeDiscountLimitPercent: 5,
    adminDiscountLimitPercent: 10,
    quotationValidityDays: 14,
    vatPercent: S.vatPercent,
    currency: 'ILS',
  };
  const product: FabricProduct = {
    id: 'p1', organizationId: 'org-1', name: 'كريب', kind: 'crepe',
    supplier: '', widthCm: 280, composition: '', imageUrl: '',
  };
  const variant: FabricVariant = {
    id: 'v1', organizationId: 'org-1', productId: 'p1', colorName: 'بيج',
    colorHex: '', sku: 'CR-B', costPerMeterAgorot: 1400, imageUrl: '',
  };
  const rules: PricingRule[] = [
    { id: 'r1', organizationId: 'org-1', band: 'tall', category: 'crepe_with_lining',
      customerPricePerMeterAgorot: 45000, tailorCostPerMeterAgorot: 7000 },
  ];
  const win: WindowUnit = {
    id: 'w1', organizationId: 'org-1', projectId: 'pr1', roomId: 'rm1',
    name: 'شباك عالٍ', widthCm: 200, heightCm: 820,
    hasLining: true, track: 'standard', fullness: 3,
    fabricVariantId: 'v1', liningVariantId: null, quantity: 1,
    notes: '', measuredAt: null, measuredBy: null,
  };

  const p = priceWindow({ window: win, product, variant, liningVariant: null, rules, settings });

  expect(p.requiresAdminPricing).toBe(true);
  expect(p.unitPriceAgorot).toBe(0);
  expect(p.lineTotalAgorot).toBe(0);
  expect(p.internalCostAgorot).toBe(0);
  expect(p.costLines.length).toBe(0);
  // الأمتار تبقى للمعلومة — المال وحده يغيب
  expect(p.runningMeters).toBe(2.0);
  expect(p.fabricMeters).toBe(6.0);
});

/**
 * قاعدة الإسقاط: تقريبٌ إلى الأغورة الأقرب **ثم** بترٌ إلى الشيكل - كما
 * تفعل حاسبة المالك حرفًا. البتر المباشر في خطوة واحدة يُنقص شيكلًا كلما
 * وقع الحاصل تحت الشيكل بكسر أغورة.
 *
 * المتجهات الثمانية لا تفرّق بين الطريقتين (أسعار المالك كلها مضاعفات ألف
 * أغورة فحاصلها صحيح دائمًا) - ولهذا نجا العيب في محرّك SQL حتى المراجعة.
 * هذه الحالة تفرّق، فتحرس القاعدة في الجانبين.
 */
test('الإسقاط خطوتان لا واحدة: 99.52 أغورة تصعد إلى الشيكل ولا تسقط منه', () => {
  const line = lineArithmetic({
    widthCm: 99.2,
    quantity: 2,
    fullness: 2.2,
    hasLining: true,
    unitPriceAgorot: 29000,
    tailorCostAgorot: 7000,
    fabricCostAgorot: 1400,
    liningCostAgorot: 900,
    trackCostAgorot: 1000,
    deliveryCostAgorot: 1000,
    measureInstallCostAgorot: 1500,
    liningMetersPerRunningMeter: 3,
  });
  // التكلفة الخام 32,299.52 أغورة: التقريب يرفعها إلى 32,300 فتبتر إلى 323 ₪
  // والبتر المباشر كان يعطي 322 ₪ - شيكل يضيع من تكلفة كل بند كهذا
  expect(line.internalCostAgorot).toBe(32300);
});
