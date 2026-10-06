/**
 * إعدادات الإشعارات.
 *
 * لكلّ مستخدم: مفتاحٌ لكلّ نوعٍ يصله، يُطفئ رنين الهاتف له وحده - الإشعار
 * يبقى في القائمة. وللأدمن: ساعة تذكير موعد الغد للمحلّ كلّه، أو إيقافه.
 *
 * الحفظ فوريّ عند اللمس، والشاشة تتقدّم الخادم: المفتاح ينقلب مباشرة ثم
 * يُرجَع إن رفض الخادم - فلا انتظار على كلّ لمسة ولا كذبة إن فشلت.
 */
import { BellRing, CalendarClock } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
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
import { useStore } from '@/providers/store';

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

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchNotificationSettings();
    if (r.ok) {
      setSettings(r.value);
      setError(null);
    } else {
      setError(r.message);
    }
    setLoading(false);
  }, []);

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

  const toggleKind = async (kind: keyof typeof KIND_INFO) => {
    const before = settings.mutedKinds;
    const next = toggleMuted(before, kind);
    setSettings({ ...settings, mutedKinds: next });
    const r = await saveMutedKinds(next);
    if (!r.ok) {
      setSettings((s) => (s ? { ...s, mutedKinds: before } : s));
      setError(r.message);
    } else {
      setError(null);
    }
  };

  const setReminder = async (enabled: boolean, hour: number) => {
    const before = { enabled: settings.visitReminderEnabled, hour: settings.visitReminderHour };
    setSettings({ ...settings, visitReminderEnabled: enabled, visitReminderHour: hour });
    const r = await saveVisitReminder(enabled, hour);
    if (!r.ok) {
      setSettings((s) =>
        s ? { ...s, visitReminderEnabled: before.enabled, visitReminderHour: before.hour } : s,
      );
      setError(r.message);
    } else {
      setError(null);
    }
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
              <Toggle value={on} onChange={() => void toggleKind(kind)} />
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
                onChange={(v) => void setReminder(v, settings.visitReminderHour)}
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
                      onPress={() => void setReminder(true, h)}
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
