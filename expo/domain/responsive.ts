/**
 * قرار الاستجابة - منطقٌ نقيّ بلا react-native، فيُفحَص بـbun:test مباشرةً
 * كبقيّة `domain/`. الخطّاف في `hooks/useResponsive.ts` غلافٌ رقيق فوقه.
 *
 * **الحكم بالعرض لا بالمنصّة**: متصفّح الهاتف ويبٌ أيضًا، ونافذةٌ مصغّرة على
 * الحاسوب تُقرأ بالإبهام لا بالفأرة. لكنّ المنصّة تبقى حارسًا قاطعًا في
 * الاتجاه الآخر: **الأصليّ مضغوطٌ دائمًا** مهما كان العرض.
 */
import { breakpoint } from '@/constants/theme';

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
