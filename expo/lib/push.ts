/**
 * إشعارات الهاتف - غلاف واجهات الجهاز.
 *
 * ما يجري في الهاتف ثلاثة أشياء لا غير، والإرسال نفسه في القاعدة:
 *  ١) رمز Expo للجهاز يُسجَّل عند الدخول (api.register_device) ويُلغى عند
 *     الخروج - فلا يرنّ هاتفٌ لمن خرج منه.
 *  ٢) الإشعار الواصل والتطبيق مفتوح يُعرض شريطًا ويحدّث القائمة.
 *  ٣) لمسُه يفتح شاشته.
 *
 * لا رمي أخطاء من هنا: الويب بلا إشعارات هاتف، وExpo Go على أندرويد بلا
 * إشعارات بعيدة منذ SDK 53، والمحاكي بلا رمز - كلّها تعود بسببٍ يُسجَّل،
 * والتطبيق يعمل كما كان.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isExpoPushToken } from '@/domain/push';
import { supabase } from '@/lib/supabase';
import { palette } from '@/constants/theme';

export const PUSH_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export type PushTokenResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'web' | 'denied' | 'unsupported' | 'error'; detail?: string };

let presentationConfigured = false;

/** كيف يظهر الإشعار والتطبيق مفتوح: شريطٌ وصوت ورقمٌ على الأيقونة. */
export function configurePushPresentation(): void {
  if (presentationConfigured || !PUSH_SUPPORTED) return;
  presentationConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** يطلب الإذن (مرّةً واحدة يسألها النظام) ويعيد رمز Expo لهذا الجهاز. */
export async function obtainPushToken(): Promise<PushTokenResult> {
  if (!PUSH_SUPPORTED) return { ok: false, reason: 'web' };
  try {
    // أندرويد 8+: لا إشعار بلا قناة، والقناة قبل طلب الإذن كما توصي Expo
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'الإشعارات',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: palette.olive,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'error', detail: 'no EAS projectId' };

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!isExpoPushToken(data)) return { ok: false, reason: 'error', detail: 'unexpected token shape' };
    return { ok: true, token: data, platform: Platform.OS as 'ios' | 'android' };
  } catch (e) {
    return { ok: false, reason: 'unsupported', detail: String((e as Error)?.message ?? e) };
  }
}

/** حالة الإذن لشاشة الإشعارات: هل نحتاج أن ندلّ المستخدم على الإعدادات؟ */
export async function pushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!PUSH_SUPPORTED) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

// آخر رمزٍ سجّلناه في هذه الجلسة - يحتاجه الخروج ليلغيه قبل إغلاق الجلسة
let registeredToken: string | null = null;

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<boolean> {
  const { error } = await supabase.rpc('register_device', { p_token: token, p_platform: platform });
  if (error) {
    console.log('[push] register_device failed', error.message);
    return false;
  }
  registeredToken = token;
  return true;
}

/**
 * يُنادى عند الخروج **قبل** إغلاق الجلسة: الإلغاء يحتاج هويّة صاحبه.
 * مهلة قصيرة: شبكةٌ ميتة لا تؤخّر الخروج - والقاعدة تنقل الجهاز لمن يدخل
 * منه بعد ذلك على أيّ حال.
 */
export async function unregisterPushBestEffort(timeoutMs = 3000): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await Promise.race([
      supabase.rpc('unregister_device', { p_token: token }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // الخروج لا يتعطّل بسبب الإشعارات
  }
  await setBadge(0);
}

export async function setBadge(n: number): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, n));
  } catch {
    // بعض مشغّلات أندرويد بلا أرقام أيقونات
  }
}
