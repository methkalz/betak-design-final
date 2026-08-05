/**
 * مشاريع أنهى الخياط إنتاجها وتنتظر موعد تركيب.
 *
 * كانت هذه الحلقة مقطوعة: `advanceStage` عند «جاهز» يُرسل للعامل الميداني
 * إشعارًا نصّه «حدد موعد التركيب»، بينما `scheduleVisit` في المخزن لم تكن
 * تُستدعى من أي شاشة. فلا زيارة تركيب تُنشأ، ولا `completeVisit` تعمل،
 * ولا يبلغ المشروع «رُكِّب» أبدًا - يقف عند «جاهز للتركيب» إلى الأبد.
 *
 * هذه البطاقة هي المدخل الناقص: المشاريع الجاهزة بلا زيارة تركيب مفتوحة،
 * ولمسة واحدة تفتح التقويم وتُنشئ الزيارة.
 */
import { useRouter } from 'expo-router';
import { CalendarPlus, Hammer } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DateTimeSheet } from '@/components/DateTimeSheet';
import { AppText, Banner, Card, Pill, Row, SectionHeader } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function PendingInstallations() {
  const { db, currentUser, scheduleVisit } = useStore();
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = useMemo(
    () =>
      db.projects.filter(
        (p) =>
          p.status === 'ready_for_install' &&
          // مشاريعه المسنَدة إليه فقط (M16): اليتيم بلا عامل يظهر للأدمن في
          // بطاقة «بلا إسناد ميداني» على لوحته - لا يُعرض على أي ميداني
          p.fieldWorkerId === currentUser?.id &&
          !db.fieldVisits.some(
            (v) => v.projectId === p.id && v.type === 'installation' && v.status !== 'completed',
          ),
      ),
    [db.projects, db.fieldVisits, currentUser?.id],
  );

  if (waiting.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="بانتظار موعد تركيب" subtitle={`${waiting.length} مشروع جاهز`} />
      {waiting.map((p) => {
        const customer = db.customers.find((c) => c.id === p.customerId);
        const windows = db.windows.filter((w) => w.projectId === p.id).length;
        return (
          <Card key={p.id} onPress={() => setTarget(p.id)}>
            <Row justify="space-between" align="center" gap={spacing.md}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading" numberOfLines={1} style={{ fontSize: 16.5 }}>
                  {customer?.fullName}
                </AppText>
                <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                  {p.code} • {p.title} • {windows} شباك
                </AppText>
              </View>
              <Pill
                label="حدّد موعدًا"
                bg={palette.sageSoft}
                fg={palette.oliveDark}
                small
                icon={<CalendarPlus size={12} color={palette.oliveDark} />}
              />
            </Row>
          </Card>
        );
      })}

      {!!error && <Banner tone="danger" title="تعذرت الجدولة" body={error} />}

      <DateTimeSheet
        visible={!!target}
        value={inDays(2)}
        title="موعد التركيب"
        onConfirm={(iso) => {
          setError(null);
          if (!target || !currentUser) return setTarget(null);
          const res = scheduleVisit(target, currentUser.id, 'installation', iso);
          setTarget(null);
          if (!res.ok) return setError(res.error);
          // الانتقال إلى الزيارة نفسها: هي الشاشة التي سيعمل عليها يوم التركيب
          router.push({ pathname: '/visit/[id]', params: { id: res.data } });
        }}
        onCancel={() => setTarget(null)}
      />
    </View>
  );
}

/** أيقونة القسم - تُستعمل في الحالات الفارغة. */
export const InstallIcon = Hammer;
