/**
 * إشعارات الهاتف - القواعد البحتة (بلا واجهات جهاز، فتُختبر بـbun test).
 *
 * الإرسال كلّه في القاعدة: محفّزٌ على core.notifications يضع رسالةً لكلّ
 * جهاز في طابور pg_net (الترحيل 20261006120001). هذا الملف يقرّر ما يقبله
 * الهاتف من تلك الرسالة.
 */

/** صيغة رمز Expo نفسها التي يفرضها api.register_device - لا نرسل للخادم ما سيرفضه. */
const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isExpoPushToken(s: unknown): s is string {
  return typeof s === 'string' && TOKEN_RE.test(s);
}

/** شاشة الإشعارات: الوجهة حين يحمل الإشعار رابطًا لا نعرفه. */
export const FALLBACK_ROUTE = '/notifications';

// الوجهات التي تكتبها دوال القاعدة اليوم (deep_link)، وما يشبهها
const ROUTE_EXACT = ['/discounts', '/payments', '/notifications'];
const ROUTE_PREFIXES = ['/project/', '/visit/', '/tailor/', '/stock/', '/customer/', '/quotation/'];

/**
 * الرابط الذي يفتحه لمسُ الإشعار.
 *
 * ★ قائمةٌ بيضاء لا تمرير: محتوى الإشعار يصل من خارج التطبيق، وroute.push
 * لنصٍّ عشوائيّ قد يفتح رابطًا خارجيًّا أو مسارًا لا وجود له. ما لا يطابق
 * يذهب إلى قائمة الإشعارات - لا يضيع اللمس ولا يفتح شيئًا غريبًا.
 */
export function notificationRoute(deepLink: unknown): string {
  if (typeof deepLink !== 'string') return FALLBACK_ROUTE;
  const p = deepLink.trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('..') || /[\s:?#\\]/.test(p)) {
    return FALLBACK_ROUTE;
  }
  if (ROUTE_EXACT.includes(p)) return p;
  const prefix = ROUTE_PREFIXES.find((x) => p.startsWith(x));
  if (prefix && /^[A-Za-z0-9-]+$/.test(p.slice(prefix.length))) return p;
  return FALLBACK_ROUTE;
}

/** رقم أيقونة التطبيق: غير المقروء لهذا المستخدم وحده (لقطة العرض فيها إشعارات غيره). */
export function unreadFor(
  list: readonly { userId: string; readAt: string | null }[],
  userId: string | null | undefined,
): number {
  if (!userId) return 0;
  let n = 0;
  for (const x of list) if (x.userId === userId && !x.readAt) n++;
  return n;
}
