/**
 * إعدادات الإشعارات - نداءات الخادم.
 *
 * ثلاث دوال في القاعدة (الترحيل 20261006120003): قراءةٌ واحدة لكلّ ما تعرضه
 * الشاشة، وكتابةٌ للأنواع المطفأة، وكتابةٌ لتذكير المحلّ يرفضها الخادم لغير
 * الأدمن مهما أرسلت الشاشة.
 */
import { supabase } from '@/lib/supabase';
import type { NotificationKind, Role } from '@/types/domain';

export interface NotificationSettings {
  role: Role;
  mutedKinds: NotificationKind[];
  visitReminderEnabled: boolean;
  visitReminderHour: number;
  canManageReminders: boolean;
}

type Out<T> = { ok: true; value: T } | { ok: false; message: string };

export async function fetchNotificationSettings(): Promise<Out<NotificationSettings>> {
  const { data, error } = await supabase.rpc('notification_settings');
  if (error || !data) return { ok: false, message: error?.message ?? 'تعذّر تحميل الإعدادات.' };
  const d = data as Record<string, unknown>;
  return {
    ok: true,
    value: {
      role: d.role as Role,
      mutedKinds: (d.muted_kinds as NotificationKind[]) ?? [],
      visitReminderEnabled: d.visit_reminder_enabled !== false,
      visitReminderHour: Number(d.visit_reminder_hour ?? 18),
      canManageReminders: d.can_manage_reminders === true,
    },
  };
}

export async function saveMutedKinds(kinds: NotificationKind[]): Promise<Out<NotificationKind[]>> {
  const { data, error } = await supabase.rpc('set_muted_notification_kinds', { p_kinds: kinds });
  if (error) return { ok: false, message: error.message };
  return { ok: true, value: ((data as { muted_kinds?: NotificationKind[] })?.muted_kinds ?? kinds) };
}

export async function saveVisitReminder(enabled: boolean, hour: number): Promise<Out<void>> {
  const { error } = await supabase.rpc('set_visit_reminder', { p_enabled: enabled, p_hour: hour });
  if (error) return { ok: false, message: error.message };
  return { ok: true, value: undefined };
}
