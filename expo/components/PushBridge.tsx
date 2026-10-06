/**
 * جسر إشعارات الهاتف - مكوّنٌ صامت في جذر التطبيق، لا يرسم شيئًا.
 *
 * يعمل في الوضع الحيّ وحده (الوضع التجريبيّ بلا خادمٍ يرسل)، وعلى الهاتف
 * وحده. أربع مهامّ، كلٌّ في مؤثّرٍ مستقلّ فلا يُسقط فشلُ واحدةٍ غيرها:
 * التسجيل، والوصول والتطبيق مفتوح، واللمس، ورقم الأيقونة.
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { notificationRoute, unreadFor } from '@/domain/push';
import {
  configurePushPresentation,
  obtainPushToken,
  PUSH_SUPPORTED,
  registerPushToken,
  setBadge,
} from '@/lib/push';
import { useStore } from '@/providers/store';

export function PushBridge() {
  const { source, currentUser, refreshLive, markNotificationRead, db } = useStore();
  const router = useRouter();
  const userId = currentUser?.id ?? null;
  const live = PUSH_SUPPORTED && source === 'live' && !!userId;

  useEffect(() => {
    configurePushPresentation();
  }, []);

  // ١) التسجيل: بعد كلّ دخول، ومن جديد إن بدّل النظام رمز الجهاز
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const register = async () => {
      const r = await obtainPushToken();
      if (cancelled) return;
      if (r.ok) await registerPushToken(r.token, r.platform);
      else console.log('[push] no device token:', r.reason, r.detail ?? '');
    };
    void register();
    const sub = Notifications.addPushTokenListener(() => void register());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [live, userId]);

  // ٢) وصل والتطبيق مفتوح: الشريط يعرضه النظام، والقائمة تتحدّث هنا
  useEffect(() => {
    if (!live) return;
    const sub = Notifications.addNotificationReceivedListener(() => void refreshLive());
    return () => sub.remove();
  }, [live, refreshLive]);

  // ٣) اللمس يفتح شاشته - ومن تشغيلٍ بارد أيضًا: لمسٌ فتح التطبيق قبل الدخول
  //    يُنفَّذ حين يكتمل الدخول
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!live) return;
    const open = (resp: Notifications.NotificationResponse | null) => {
      if (!resp) return;
      const key = resp.notification.request.identifier;
      if (handledRef.current === key) return;
      handledRef.current = key;
      const data = (resp.notification.request.content.data ?? {}) as Record<string, unknown>;
      router.push(notificationRoute(data.deep_link) as never);
      // القراءة تحدّث اللقطة أيضًا، فتجد الشاشةُ ما جاء الإشعار من أجله
      if (typeof data.notification_id === 'string') void markNotificationRead(data.notification_id);
      else void refreshLive();
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [live, router, markNotificationRead, refreshLive]);

  // ٤) رقم الأيقونة يتبع غير المقروء: يرتفع مع الإرسال ويهبط مع القراءة
  const unread = useMemo(() => unreadFor(db.notifications, userId), [db.notifications, userId]);
  useEffect(() => {
    if (live) void setBadge(unread);
  }, [live, unread]);

  return null;
}
