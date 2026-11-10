/**
 * «يتوفر تحديث» - قرار ما يُعرض، بقواعد بحتة تُختبر بـbun test.
 *
 * رقم البناء المثبَّت (versionCode على أندرويد، buildNumber على iOS) يُقارَن
 * بسياسة يضبطها الأدمن (api.app_release_policy):
 *   - دون min_build   → «يجب التحديث»: شاشةٌ تمنع الاستخدام.
 *   - دون latest_build → «يتوفر تحديث»: شريطٌ يُغلق، ولا يعود للنسخة نفسها.
 * والمتجر نفسه قد يعلن نسخةً أحدث قبل أن يرفع الأدمن الرقم - فيُعرض الاختياريّ.
 *
 * والقاعدة الحاكمة: الشكّ لا يمنع أحدًا. رقمٌ غير مقروء، أو سياسةٌ لم تُجلب،
 * أو صفرٌ في الإعدادات = لا شيء يُعرض.
 */

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'optional'; target: number }
  | { kind: 'required'; target: number };

export interface ReleasePolicy {
  latestBuild: number;
  minBuild: number;
  iosAppStoreId: string | null;
}

/** «12» أو 12 → 12. وما ليس عددًا صحيحًا موجبًا → null (لا قرار). */
export function parseBuild(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function decideUpdate(input: {
  installed: number | null;
  policy: ReleasePolicy | null;
  /** المتجر يعلن نسخةً أحدث (من فحص المتجر نفسه، حين يتاح). */
  storeHasNewer?: boolean;
  /** رقمٌ أغلق المستخدم شريطه سابقًا - لا يعود له. */
  dismissedTarget?: number | null;
}): UpdateDecision {
  const { installed, policy, storeHasNewer, dismissedTarget } = input;
  if (installed === null || !policy) return { kind: 'none' };

  if (policy.minBuild > 0 && installed < policy.minBuild) {
    return { kind: 'required', target: Math.max(policy.minBuild, policy.latestBuild) };
  }

  const behindPolicy = policy.latestBuild > 0 && installed < policy.latestBuild;
  if (!behindPolicy && !storeHasNewer) return { kind: 'none' };

  // الهدف: رقم الأدمن إن وُجد، وإلا «أحدث من المثبَّت» - يكفي للإغلاق مرّةً واحدة
  const target = behindPolicy ? policy.latestBuild : installed + 1;
  if (dismissedTarget != null && dismissedTarget >= target) return { kind: 'none' };
  return { kind: 'optional', target };
}

export const ANDROID_PACKAGE = 'com.betakd.app';

/** روابط المتجر احتياطًا حين لا تتاح نافذة التحديث داخل التطبيق. الأوّل يفتح تطبيق المتجر، والثاني صفحته. */
export function storeLinks(platform: 'ios' | 'android', iosAppStoreId: string | null): string[] {
  if (platform === 'android') {
    return [
      `market://details?id=${ANDROID_PACKAGE}`,
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    ];
  }
  if (!iosAppStoreId || !/^\d{6,12}$/.test(iosAppStoreId)) return [];
  return [`itms-apps://apps.apple.com/app/id${iosAppStoreId}`, `https://apps.apple.com/app/id${iosAppStoreId}`];
}
