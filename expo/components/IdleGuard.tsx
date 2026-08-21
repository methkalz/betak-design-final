/**
 * حارس الخمول - يُنهي جلسة الويب بعد نصف ساعةٍ بلا نشاط.
 *
 * **الويب وحده**: على الهاتف الجلسة مشفَّرة خلف قفل الجهاز، والتطبيق ملكُ
 * صاحبه. أمّا مكتبُ المعرض فيفتحه أكثر من موظّف، ومتصفّحٌ متروكٌ مفتوحًا
 * يعني حساب أدمن مفتوحًا أمام من يجلس بعده.
 *
 * لا يرسم شيئًا - مستمعاتٌ ومؤقّتٌ فقط.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { IDLE_LIMIT_MS, isIdleExpired } from '@/domain/idle';
import { useStore } from '@/providers/store';

/** أحداثٌ تدلّ على وجود إنسان. `passive` كي لا تُعيق التمرير. */
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/** دورية الفحص: دقيقة. الدقّة المطلوبة دقائق لا ثوانٍ. */
const CHECK_EVERY_MS = 60_000;

export function IdleGuard() {
  const { currentUser, signOut, source } = useStore();
  const router = useRouter();
  const lastActivity = useRef<number>(Date.now());
  // مرجعٌ للخروج كي لا يُعاد بناء المستمعات مع كلّ رسم
  const endSession = useRef<() => void>(() => {});

  endSession.current = () => {
    signOut();
    router.replace('/login');
  };

  const armed = Platform.OS === 'web' && source === 'live' && !!currentUser;

  useEffect(() => {
    if (!armed) return;
    const doc = globalThis.document;
    const win = globalThis.window;
    if (!doc || !win) return;

    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };

    ACTIVITY.forEach((e) => win.addEventListener(e, touch, { passive: true }));

    const check = () => {
      if (isIdleExpired(lastActivity.current, Date.now(), IDLE_LIMIT_MS)) endSession.current();
    };

    // العودة إلى اللسان تفحص فورًا: قد ينام اللسان ساعاتٍ والمؤقّت مخنوق،
    // فيعود الموظّف ليجد جلسته حيّة لولا هذا الفحص.
    const onVisible = () => {
      if (doc.visibilityState === 'visible') check();
    };
    doc.addEventListener('visibilitychange', onVisible);

    const timer = win.setInterval(check, CHECK_EVERY_MS);

    return () => {
      ACTIVITY.forEach((e) => win.removeEventListener(e, touch));
      doc.removeEventListener('visibilitychange', onVisible);
      win.clearInterval(timer);
    };
  }, [armed]);

  return null;
}
