/**
 * الاستجابة للقياس - حَكَمٌ واحد يقرّر «مكتبٌ أم هاتف» في التطبيق كلّه.
 *
 * القرار نفسه منطقٌ نقيّ في `domain/responsive.ts` (مفحوصٌ بالوحدة)، وهذا
 * غلافُه التفاعليّ: يقرأ عرض النافذة الحيّ فيستجيب لتغيير حجمها على المكتب.
 *
 * ثلاث ضماناتٍ مستقلّة أن نسخة الهاتف لا تتأثّر:
 * ‏١) `resolveResponsive` يعيد `false` قسرًا حين المنصّة ليست ويبًا - فالفرع
 *    المكتبيّ غير قابلٍ للوصول أصلًا على الهاتف مهما كان عرض الشاشة.
 * ‏٢) `app.json` يقفل `portrait` و`supportsTablet: false` - فلا هاتفَ يبلغ 1024.
 * ‏٣) كلّ سقوف `layout` أوسع من أعرض هاتف، فحتى لو انطلقت لكانت بلا أثر.
 * والثلاثة مقفولةٌ باختبار `hooks/useResponsive.test.ts`.
 */
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing } from '@/constants/theme';
import {
  HEADER_DESKTOP,
  HEADER_PHONE,
  LIST_DESKTOP,
  LIST_PHONE,
  resolveResponsive,
  type Responsive,
} from '@/domain/responsive';

export type { Responsive };

export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  return resolveResponsive(width, Platform.OS);
}

/** اختصارٌ لأكثر الحراس استعمالًا. */
export function useIsDesktop(): boolean {
  return useResponsive().isDesktop;
}

/**
 * الحشوة العلوية: الهاتف يأخذها من النظام (النتوء وشريط الحالة)، والويب لا
 * نظامَ له فترجع `insets` أصفارًا - فيلتصق المحتوى بحافّة النافذة. هذا
 * الخطّاف يعوّضها بحشوةٍ مكتبية ثابتة، ولا يمسّ حساب الهاتف.
 */
export function useTopPad(extra: number = spacing.sm): number {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  return isDesktop ? layout.gutter : insets.top + extra;
}

/**
 * نمط حاوية قائمة الشاشة - مشتركٌ بين شاشات التبويب كلّها، فعرض القوائم
 * يُعرَّف مرّةً واحدة. عمودٌ واحد لا عمودان: البطاقة تبقى بطاقةً بنفس
 * طريقة عمل الهاتف.
 */
export function useListContent(): ViewStyle {
  return (useResponsive().isDesktop ? LIST_DESKTOP : LIST_PHONE) as ViewStyle;
}

/**
 * رأس شاشة القائمة - العنوان والبحث والمرشّحات فوق القائمة.
 *
 * الرأس لا يُمرَّر مع القائمة فلا يرث `contentContainerStyle`، فيلزمه سقفُه
 * الخاصّ. وبدونه يمتدّ على النافذة كلّها بينما البطاقات تحته موسَّطة.
 */
export function useListHeader(): ViewStyle {
  return (useResponsive().isDesktop ? HEADER_DESKTOP : HEADER_PHONE) as ViewStyle;
}
