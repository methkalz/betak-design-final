/**
 * رجوع آمن: `router.back()` لا يفعل شيئًا صامتًا حين لا توجد شاشة سابقة في
 * المكدّس - ويحدث ذلك في حالات واقعية عدة: بعد `replace` (إنشاء مشروع أو
 * زبون ينقلك إلى صفحته)، أو فتح التطبيق على شاشة داخلية من إشعار، أو إعادة
 * تحميله أثناء التصفح. عندها يبدو الزر «معطّلًا أحيانًا» بلا سبب ظاهر.
 *
 * هذا الخطّاف يرجع إن أمكن، وإلا انتقل إلى وجهةٍ منطقية بدل أن يبتلع الضغطة.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

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
