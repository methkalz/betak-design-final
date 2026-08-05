/**
 * ملف الموظف.
 *
 * ثلاثة أسئلة يسألها الأدمن عن أي موظف، وبهذا الترتيب: ماذا بين يديه الآن،
 * وكيف كان أداؤه، وماذا فعل مؤخرًا. الشاشة مرتّبة على هذا الترتيب لا على
 * ترتيب الجداول في القاعدة.
 *
 * والمؤشرات تُقرأ من الدور: الخياط يُقاس بالتسليم والهدر، والعامل الميداني
 * بالزيارات، والمبيعات بالعروض والتحصيل. لا يُعرض لدورٍ مؤشرٌ لا أساس له في
 * بياناته.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft, Phone, ShieldCheck, UserX } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import {
  AppText,
  Banner,
  Card,
  ConfirmSheet,
  Divider,
  EmptyState,
  Pill,
  Row,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { gradients, palette, radius, spacing } from '@/constants/theme';
import { can, ROLE_LABELS } from '@/domain/permissions';
import { staffDossier, type StaffMetric } from '@/domain/staff';
import { formatDate, formatDateTime, phone as fmtPhone } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function StaffDossierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, role, setProfileActive } = useStore();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);

  const profile = db.profiles.find((p) => p.id === id);
  const dossier = useMemo(
    () => (profile ? staffDossier(db, profile.id, Date.now()) : null),
    [db, profile],
  );
  const activity = useMemo(
    () =>
      db.auditLogs
        .filter((l) => l.actorId === id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [db.auditLogs, id],
  );

  if (!profile || !dossier) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<UserX size={26} color={palette.olive} />}
          title="الحساب غير موجود"
          body="ربما حُذف أو ليس ضمن صلاحياتك."
        />
      </ScrollScreen>
    );
  }

  const isAdmin = can(role, 'manage_users');

  return (
    <ScrollScreen>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <LinearGradient
          colors={gradients.heroDeep as unknown as [string, string]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: spacing.lg }}
        >
          <Row gap={spacing.md} align="center">
            <Avatar id={profile.id} name={profile.fullName} size={62} onDark />
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="title" color={palette.ivory} numberOfLines={1}>
                {profile.fullName}
              </AppText>
              <AppText variant="caption" color={palette.sage}>
                {profile.title}
              </AppText>
              <Row gap={6}>
                <Phone size={13} color={palette.sage} />
                <AppText variant="caption" color={palette.sage}>
                  {fmtPhone(profile.phone)}
                </AppText>
              </Row>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <Pill
                label={ROLE_LABELS[profile.role]}
                bg="rgba(255,255,255,0.16)"
                fg={palette.ivory}
                small
              />
              {!profile.isActive && (
                <Pill label="معطّل" bg={palette.dangerSoft} fg={palette.danger} small />
              )}
            </View>
          </Row>
        </LinearGradient>
      </Card>

      {!profile.isActive && (
        <Banner
          tone="warning"
          title="هذا الحساب معطّل"
          body="لا يظهر في قوائم الإسناد ولا يستطيع الدخول، وسجلّه محفوظ كما هو."
        />
      )}

      <Card>
        <SectionHeader
          title="بين يديه الآن"
          subtitle={dossier.open.length === 0 ? 'لا شيء معلّق' : `${dossier.open.length} مهمة`}
        />
        {dossier.open.length === 0 ? (
          <Row gap={spacing.sm}>
            <ShieldCheck size={16} color={palette.success} />
            <AppText variant="caption" color={palette.muted}>
              أنهى كل ما أُسند إليه.
            </AppText>
          </Row>
        ) : (
          dossier.open.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => router.push({ pathname: '/project/[id]', params: { id: t.projectId } })}
                style={({ pressed }) => [
                  { borderRadius: radius.sm, paddingVertical: spacing.sm },
                  pressed && { backgroundColor: palette.ivoryDeep },
                ]}
              >
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {t.title}
                    </AppText>
                    <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                      {t.hint}
                    </AppText>
                    {!!t.dueAt && (
                      <Row gap={5} style={{ marginTop: 3 }}>
                        <CalendarClock size={12} color={t.overdue ? palette.danger : palette.muted} />
                        <AppText variant="caption" color={t.overdue ? palette.danger : palette.muted}>
                          {t.overdue ? 'تأخّر - ' : ''}
                          {formatDate(t.dueAt)}
                        </AppText>
                      </Row>
                    )}
                  </View>
                  <ChevronLeft size={16} color={palette.muted} />
                </Row>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionHeader title="الأداء" subtitle="الشهر الجاري وما قبله" />
        <Row gap={spacing.sm} wrap>
          {dossier.metrics.map((m) => (
            <MetricTile key={m.label} metric={m} />
          ))}
        </Row>
      </Card>

      <Card>
        <SectionHeader
          title="آخر ما فعل"
          subtitle={
            dossier.lastActiveAt ? `آخر نشاط ${formatDateTime(dossier.lastActiveAt)}` : 'لا نشاط بعد'
          }
        />
        {activity.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لم يُسجَّل له أثر في سجل التدقيق بعد.
          </AppText>
        )}
        {activity.map((l, i) => (
          <View key={l.id}>
            {i > 0 && <Divider />}
            <Row justify="space-between" align="flex-start" gap={spacing.md}>
              <AppText variant="caption" style={{ flex: 1 }}>
                {l.summary}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {formatDateTime(l.createdAt)}
              </AppText>
            </Row>
          </View>
        ))}
      </Card>

      {isAdmin && (
        <Card onPress={() => setConfirm(true)}>
          <Row gap={spacing.md}>
            <UserX size={18} color={profile.isActive ? palette.danger : palette.success} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={profile.isActive ? palette.danger : palette.success}>
                {profile.isActive ? 'تعطيل الحساب' : 'إعادة تفعيل الحساب'}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {profile.isActive
                  ? 'يخرج من قوائم الإسناد ويبقى سجلّه كاملًا'
                  : 'يعود للظهور في قوائم الإسناد'}
              </AppText>
            </View>
          </Row>
        </Card>
      )}

      <ConfirmSheet
        visible={confirm}
        icon={<UserX size={24} color={profile.isActive ? palette.danger : palette.success} />}
        title={profile.isActive ? 'تعطيل هذا الحساب؟' : 'إعادة تفعيل الحساب؟'}
        body={
          profile.isActive
            ? 'لن يستطيع الدخول ولن يظهر في قوائم الإسناد. المشاريع والحركات المسجّلة باسمه تبقى كما هي.'
            : 'سيعود الحساب للعمل ويظهر في قوائم الإسناد من جديد.'
        }
        confirmLabel={profile.isActive ? 'نعم، عطّل' : 'نعم، فعّل'}
        onConfirm={() => {
          setProfileActive(profile.id, !profile.isActive);
          setConfirm(false);
        }}
        onCancel={() => setConfirm(false)}
      />
    </ScrollScreen>
  );
}

/** بلاطة رقم - اللون يتدخّل حين يستحق الرقم تدخّلًا فقط. */
function MetricTile({ metric }: { metric: StaffMetric }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        borderRadius: radius.md,
        padding: spacing.md,
        backgroundColor: metric.alarming ? palette.dangerSoft : palette.ivoryDeep,
      }}
    >
      <AppText variant="number" color={metric.alarming ? palette.danger : palette.charcoal}>
        {metric.value}
      </AppText>
      <AppText variant="caption" color={palette.muted}>
        {metric.label}
      </AppText>
    </View>
  );
}
