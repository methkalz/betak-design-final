/**
 * رجوع آمن: `router.back()` لا يفعل شيئًا صامتًا حين لا توجد شاشة سابقة في
 * المكدّس - ويحدث ذلك في حالات واقعية عدة: بعد `replace` (إنشاء مشروع أو
 * زبون ينقلك إلى صفحته)، أو فتح التطبيق على شاشة داخلية من إشعار، أو إعادة
 * تحميله أثناء التصفح. عندها يبدو الزر «معطّلًا أحيانًا» بلا سبب ظاهر.
 *
 * هذا الخطّاف يرجع إن أمكن، وإلا انتقل إلى وجهةٍ منطقية بدل أن يبتلع الضغطة.
 */
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

export function useGoBack(fallback: string = '/home'): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback as never);
  }, [router, fallback]);
}

/**
 * زر الرجوع في نظام أندرويد نفسه يصيبه العطب ذاته: حين يفرغ المكدّس تمرّ
 * الضغطة دون أن يلتقطها أحد فلا يحدث شيء. يُسجَّل هذا المستمع في الجذر، أي
 * قبل مستمع الملاحة، فلا يعمل إلا بعد أن تعجز الملاحة عن التعامل مع الضغطة.
 *
 * على الشاشة الرئيسية نتنحّى عمدًا ليخرج المستخدم من التطبيق كما يتوقع في
 * أندرويد؛ لولا ذلك لصار الخروج مستحيلًا.
 */
export function useAndroidBackFallback(fallback: string = '/home'): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      if (pathname === fallback || pathname === '/') return false;
      router.replace(fallback as never);
      return true;
    });
    return () => sub.remove();
  }, [router, pathname, fallback]);
}
