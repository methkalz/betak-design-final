/**
 * تكاليف المالك الحقيقية (تسعيرة 6.8.2026) - للاختبارات وحدها.
 *
 * قاعدة المالك (12.11.2026): السعر الخام - أي ما يكلّف المحلَّ - لا يظهر في أي
 * مكان عام: لا في صور المتجر ولا في ملفات الموقع ولا في التطبيق المنشور. أسعار
 * البيع للزبون مسموحة.
 *
 * لذلك تحمل البيانات التجريبية في seed.ts تكاليف وهمية (فهي تُحزَم في كل بناء،
 * ويقرؤها كل من يفتح ملفات betakd.com)، والتكاليف الحقيقية هنا وحدها. لا يستورد
 * هذا الملفَّ أيُّ شيء في التطبيق، فلا يدخل حزمة الويب ولا الـ AAB. اختبارات
 * التسعير التي تثبّت أرقام المالك تمرّ بـ withOwnerCosts(buildSeed()).
 *
 * لا تستورد هذا الملف من شاشة أو مكوّن أو مزوّد.
 */
import type { Database } from './seed';

/** كلفة المتر على المحل لكل صنف قماش (أغورة). */
const VARIANT_COST_PER_METER: Record<string, number> = {
  'var-crepe-offwhite': 1400,
  'var-crepe-white': 1400,
  'var-bashtan-offwhite': 2000,
  'var-bashtan-white': 2000,
  'var-bashtan-beige': 2000,
  'var-lining-70': 900,
  'var-lining-100': 3000,
};

/** أجرة الخياطة للمتر لكل قاعدة تسعير (أغورة). */
const TAILOR_COST_PER_METER: Record<string, number> = {
  'pr-std-crepe-lined': 4000,
  'pr-std-crepe-plain': 4000,
  'pr-std-other-plain': 4000,
  'pr-std-other-lined': 4000,
  'pr-tall-crepe-lined': 7000,
  'pr-tall-crepe-plain': 7000,
  'pr-tall-other-plain': 7000,
  'pr-tall-other-lined': 7000,
};

/** تكاليف المحل في الإعدادات (أغورة). */
const SETTINGS_COSTS = {
  trackCostPerMeterAgorot: 1000,
  deliveryCostPerMeterAgorot: 1000,
  measureInstallCostPerMeterAgorot: 1500,
  liningCostPerMeterAgorot: 900,
  fieldVisitWageAgorot: 15000,
  motorizedTrackCostPerMeterAgorot: 10000,
  motorCostAgorot: 40000,
  remoteCostAgorot: 10000,
} as const;

/** نسخة من القاعدة التجريبية بتكاليف المالك الحقيقية. لا تعدّل الأصل. */
export function withOwnerCosts(db: Database): Database {
  const missing = [
    ...Object.keys(VARIANT_COST_PER_METER).filter((id) => !db.fabricVariants.some((v) => v.id === id)),
    ...Object.keys(TAILOR_COST_PER_METER).filter((id) => !db.pricingRules.some((r) => r.id === id)),
  ];
  if (missing.length) throw new Error(`ownerCosts.fixture: ids missing from seed: ${missing.join(', ')}`);
  return {
    ...db,
    fabricVariants: db.fabricVariants.map((v) =>
      v.id in VARIANT_COST_PER_METER ? { ...v, costPerMeterAgorot: VARIANT_COST_PER_METER[v.id] } : v,
    ),
    pricingRules: db.pricingRules.map((r) =>
      r.id in TAILOR_COST_PER_METER ? { ...r, tailorCostPerMeterAgorot: TAILOR_COST_PER_METER[r.id] } : r,
    ),
    settings: { ...db.settings, ...SETTINGS_COSTS },
  };
}
