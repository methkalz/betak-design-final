/**
 * قرار الاستجابة - منطقٌ نقيّ بلا react-native، فيُفحَص بـbun:test مباشرةً
 * كبقيّة `domain/`. الخطّاف في `hooks/useResponsive.ts` غلافٌ رقيق فوقه.
 *
 * **الحكم بالعرض لا بالمنصّة**: متصفّح الهاتف ويبٌ أيضًا، ونافذةٌ مصغّرة على
 * الحاسوب تُقرأ بالإبهام لا بالفأرة. لكنّ المنصّة تبقى حارسًا قاطعًا في
 * الاتجاه الآخر: **الأصليّ مضغوطٌ دائمًا** مهما كان العرض.
 */
import { breakpoint, layout } from '@/constants/theme';

export type Responsive = {
  /** عرض النافذة الحالي بالبكسل المستقلّ. */
  width: number;
  /** ‏≥1024 على الويب: تخطيطٌ يُقاد بالفأرة. */
  isDesktop: boolean;
  /** ‏≥1440 على الويب: متّسعٌ لتقسيمٍ أفقيّ. */
  isWide: boolean;
};

export function resolveResponsive(width: number, platformOS: string): Responsive {
  // الضمانة القاطعة: الهاتف لا يدخل الفرع المكتبيّ أبدًا.
  const web = platformOS === 'web';
  return {
    width,
    isDesktop: web && width >= breakpoint.desktop,
    isWide: web && width >= breakpoint.wide,
  };
}

/*
 * ثوابت حاويات التخطيط - هنا لا في المكوّنات، لسببين:
 * ‏١) ثابتٌ على مستوى الوحدة لا كائنٌ يُبنى مع كلّ رسم. `useWindowDimensions`
 *    يُطلق مع كلّ بكسل تغييرِ حجم، فكائنٌ جديد كلّ مرّة يُبطل أيّ memo تحته.
 * ‏٢) وحدةٌ نقيّة تُفحَص بالوحدة - ففرضيّة «الهاتف لم يتغيّر» تصير **مقفولةً
 *    بالاختبار** لا موعودةً في وصف الـPR.
 *
 * قيم `_PHONE` نسخٌ حرفية ممّا كان مضمَّنًا في الشيفرة، والاختبار يحرسها.
 */
export const CONTENT_PHONE = { padding: 16, paddingBottom: 120, gap: 16 } as const;
export const LIST_PHONE = { padding: 16, paddingBottom: 120, gap: 12 } as const;

/**
 * على المكتب: عمودٌ موسَّط بعرض القراءة. و`paddingBottom` يعود إلى الحشوة
 * العادية - الـ120 كانت تُفرِّغ مكانًا لشريط تبويباتٍ لا وجود له هنا.
 */
export const CONTENT_DESKTOP = {
  padding: layout.gutter,
  paddingBottom: layout.gutter,
  gap: 16,
  width: '100%',
  maxWidth: layout.column,
  alignSelf: 'center',
} as const;

/** للشاشات التي تعرض شبكاتٍ أوسع من عمود القراءة. */
export const CONTENT_DESKTOP_WIDE = { ...CONTENT_DESKTOP, maxWidth: layout.columnWide } as const;

/** حاوية القوائم على المكتب - نفس عرض اللوحة فيتّسق التطبيق كلّه. */
export const LIST_DESKTOP = { ...CONTENT_DESKTOP, gap: 12 } as const;
