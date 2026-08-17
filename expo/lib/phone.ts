/**
 * أرقام الهاتف: تطبيعٌ واحد يعرفه التطبيق والخادم معًا.
 *
 * الموظف يعرف رقمه لا بريدًا، فالرقم هو هويته عند الدخول. ويُطبَّع إلى
 * صيغةٍ واحدة (972…) كي يدخل بـ052 أو 52 أو +972-52 فيصل إلى الحساب
 * نفسه، ثم يُشتق منه بريدٌ اصطلاحي لا يُرسَل إليه شيء أبدًا - Supabase
 * يطلب بريدًا، ونحن نطلب رقمًا.
 */

const LOCAL_PREFIX = '972';

/** أرقامٌ فقط، بلا مسافات ولا شرطات ولا أقواس. */
export function digitsOnly(input: string): string {
  return (input ?? '').replace(/[^0-9]/g, '');
}

/**
 * الصيغة القانونية: 972 + الرقم بلا صفره الأول.
 * يقبل 0526444414 و526444414 و972526444414 و+972 52-644-4414.
 * يرجع null إن لم يكن الرقم إسرائيليًا صالحًا بطوله.
 */
export function normalizePhone(input: string): string | null {
  let d = digitsOnly(input);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith(LOCAL_PREFIX)) d = d.slice(LOCAL_PREFIX.length);
  if (d.startsWith('0')) d = d.slice(1);
  // الجوال الإسرائيلي بعد إسقاط الصفر: تسع خانات تبدأ بـ5
  if (!/^5[0-9]{8}$/.test(d)) return null;
  return LOCAL_PREFIX + d;
}

/** للعرض: 052-644-4414 */
export function displayPhone(input: string): string {
  const n = normalizePhone(input);
  if (!n) return input;
  const d = n.slice(LOCAL_PREFIX.length);
  return `0${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
}

/**
 * البريد الاصطلاحي المشتق من الرقم - هوية الحساب عند Supabase وحده.
 * لا يُرسَل إليه بريد ولا يُعرض للمستخدم في أي شاشة.
 */
export function phoneIdentityEmail(input: string): string | null {
  const n = normalizePhone(input);
  return n ? `${n}@baytak.local` : null;
}
