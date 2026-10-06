/**
 * إعدادات الإشعارات.
 *
 * لكلّ مستخدم: مفتاحٌ لكلّ نوعٍ يصله، يُطفئ رنين الهاتف له وحده - الإشعار
 * يبقى في القائمة. وللأدمن: ساعة تذكير موعد الغد للمحلّ كلّه، أو إيقافه.
 *
 * الحفظ فوريّ عند اللمس والشاشة تتقدّم الخادم. والطلبات في طابورٍ واحد
 * بترتيب اللمس، وكلٌّ منها يُرسل آخر ما أراده المستخدم لحظة تنفيذه: لمستان
 * سريعتان لا يغلب فيهما طلبٌ قديم وصل متأخّرًا طلبًا أحدث. وعند الرفض يُعاد
 * التحميل من الخادم، فهو مصدر الحقيقة.
 */
import { BellRing, CalendarClock } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { PushPermissionHint } from '@/components/PushPermissionHint';
import { AppText, Banner, Button, Card, Chip, Row, ScrollScreen, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { formatHour, KIND_INFO, kindsForRole, reminderHourOptions, toggleMuted } from '@/domain/notificationPrefs';
import {
  fetchNotificationSettings,
  saveMutedKinds,
  saveVisitReminder,
  type NotificationSettings,
} from '@/lib/notificationSettings';
import { useStore, type Result } from '@/providers/store';
import type { NotificationKind } from '@/types/domain';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: palette.olive, false: palette.sandDeep }}
      thumbColor={palette.white}
    />
  );
}

export default function NotificationSettingsScreen() {
  const { source } = useStore();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ما يريده المستخدم الآن - يقرؤه الحفظ لحظة تنفيذه لا لحظة اللمس
  const desiredRef = useRef<{ muted: NotificationKind[]; enabled: boolean; hour: number } | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchNotificationSettings();
    if (r.ok) {
      setSettings(r.data);
      desiredRef.current = {
        muted: r.data.mutedKinds,
        enabled: r.data.visitReminderEnabled,
        hour: r.data.visitReminderHour,
      };
      setError(null);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, []);

  const enqueue = useCallback(
    (job: () => Promise<Result>) => {
      queueRef.current = queueRef.current
        .then(async () => {
          const r = await job();
          if (r.ok) {
            setError(null);
          } else {
            // التحميل أوّلًا ثم الرسالة: التحميل الناجح يمحو الخطأ
            await load();
            setError(r.error);
          }
        })
        // نداءٌ رمى استثناءً لا يوقف الطابور كلّه
        .catch(() => setError('تعذّر الحفظ. تحقّق من الاتصال وأعد المحاولة.'));
    },
    [load],
  );

  useEffect(() => {
    if (source === 'live') void load();
    else setLoading(false);
  }, [source, load]);

  if (source !== 'live') {
    return (
      <ScrollScreen>
        <Banner
          tone="info"
          title="الإعدادات تعمل مع الحساب الحقيقي"
          body="سجّل الدخول برقم هاتفك وكلمة السرّ لتتحكّم بإشعارات هاتفك."
        />
      </ScrollScreen>
    );
  }

  if (!settings) {
    return (
      <ScrollScreen>
        {error ? (
          <Banner
            tone="danger"
            title="تعذّر تحميل الإعدادات"
            body={error}
            action={<Button label="إعادة المحاولة" variant="ghost" onPress={load} />}
          />
        ) : (
          <AppText variant="caption" color={palette.muted}>
            {loading ? 'جارٍ التحميل…' : ''}
          </AppText>
        )}
      </ScrollScreen>
    );
  }

  const toggleKind = (kind: keyof typeof KIND_INFO) => {
    const d = desiredRef.current;
    if (!d) return;
    d.muted = toggleMuted(d.muted, kind);
    setSettings((st) => (st ? { ...st, mutedKinds: d.muted } : st));
    enqueue(() => saveMutedKinds(desiredRef.current?.muted ?? d.muted));
  };

  const setReminder = (enabled: boolean, hour: number) => {
    const d = desiredRef.current;
    if (!d) return;
    d.enabled = enabled;
    d.hour = hour;
    setSettings((st) => (st ? { ...st, visitReminderEnabled: enabled, visitReminderHour: hour } : st));
    enqueue(() => {
      const cur = desiredRef.current ?? d;
      return saveVisitReminder(cur.enabled, cur.hour);
    });
  };

  const kinds = kindsForRole(settings.role);

  return (
    <ScrollScreen>
      <PushPermissionHint />

      {error && <Banner tone="danger" title="لم يُحفظ التغيير" body={error} />}

      <SectionHeader
        title="ما يرنّ على هاتفك"
        subtitle="إطفاء نوعٍ يوقف رنين الهاتف له فقط. الإشعار يبقى في قائمة الإشعارات داخل التطبيق."
      />
      <Card style={{ gap: spacing.md }}>
        {kinds.map((kind) => {
          const on = !settings.mutedKinds.includes(kind);
          return (
            <Row key={kind} gap={spacing.md}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">{KIND_INFO[kind].label}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {KIND_INFO[kind].description}
                </AppText>
              </View>
              <Toggle value={on} onChange={() => toggleKind(kind)} />
            </Row>
          );
        })}
      </Card>

      {settings.canManageReminders && (
        <>
          <SectionHeader title="تذكير موعد الغد - للمحلّ كلّه" />
          <Card style={{ gap: spacing.md }}>
            <Row gap={spacing.md}>
              <CalendarClock size={20} color={palette.olive} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">تذكير العمّال بزيارات الغد</AppText>
                <AppText variant="caption" color={palette.muted}>
                  يصل لكلّ من لديه زيارة قياس أو تركيب في اليوم التالي.
                </AppText>
              </View>
              <Toggle
                value={settings.visitReminderEnabled}
                onChange={(v) => setReminder(v, settings.visitReminderHour)}
              />
            </Row>
            {settings.visitReminderEnabled && (
              <View style={{ gap: spacing.sm }}>
                <Row gap={spacing.sm}>
                  <BellRing size={16} color={palette.muted} />
                  <AppText variant="caption" color={palette.muted}>
                    ساعة الإرسال (ومن تُضاف زيارته بعدها يصله التذكير خلال ساعة، حتى منتصف الليل)
                  </AppText>
                </Row>
                <Row gap={spacing.sm} wrap>
                  {reminderHourOptions(settings.visitReminderHour).map((h) => (
                    <Chip
                      key={h}
                      label={formatHour(h)}
                      active={settings.visitReminderHour === h}
                      onPress={() => setReminder(true, h)}
                    />
                  ))}
                </Row>
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollScreen>
  );
}
