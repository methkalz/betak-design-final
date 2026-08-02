import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  BadgePercent,
  Banknote,
  CalendarClock,
  ChevronLeft,
  Package,
  Scissors,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { ProjectRow, StatTile, TailorCard, VisitCard } from '@/components/cards';
import {
  AppText,
  Banner,
  Button,
  Card,
  ProgressBar,
  Row,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { VISIT_TYPE_LABELS } from '@/domain/labels';
import { projectFinance, useRollViews } from '@/hooks/selectors';
import { formatDate, formatTime, isSameDay, money } from '@/lib/format';
import { useStore } from '@/providers/store';

export default function DashboardScreen() {
  const { role, hydrated } = useStore();
  if (!hydrated) return <LoadingDashboard />;
  if (role === 'field') return <FieldDashboard />;
  if (role === 'tailor') return <TailorDashboard />;
  return <AdminDashboard />;
}

function LoadingDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory }}>
      <AppHeader />
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <Skeleton height={110} />
        <Skeleton height={160} />
        <Skeleton height={120} />
      </View>
    </View>
  );
}

function AdminDashboard() {
  const { db, currentUser } = useStore();
  const router = useRouter();
  const rolls = useRollViews();

  const stats = useMemo(() => {
    const active = db.projects.filter((p) => p.status !== 'completed');
    const openValue = active.reduce((s, p) => s + projectFinance(db, p.id).totalAgorot, 0);
    const due = db.projects.reduce((s, p) => s + projectFinance(db, p.id).dueAgorot, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const collected = db.payments
      .filter((p) => new Date(p.createdAt) >= monthStart)
      .reduce((s, p) => s + p.amountAgorot, 0);
    return { activeCount: active.length, openValue, due, collected };
  }, [db]);

  const pendingDiscounts = db.discountRequests.filter((d) => d.status === 'pending');
  const lowStock = rolls.filter(
    (r) => r.balance.availableM < LOW_STOCK_THRESHOLD_M && !r.roll.isMiniRoll,
  );
  const todayVisits = db.fieldVisits.filter(
    (v) => isSameDay(v.scheduledAt, new Date()) && v.status !== 'completed',
  );
  const hotProjects = useMemo(
    () =>
      db.projects
        .filter((p) => p.status !== 'completed')
        .sort((a, b) => (a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0))
        .slice(0, 4),
    [db.projects],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader subtitle={`${db.organization.name} • ${stats.activeCount} مشروع نشط`} />

      <View style={{ padding: spacing.lg, gap: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          <Row gap={spacing.md}>
            <StatTile
              icon={<TrendingUp size={18} color={palette.olive} />}
              label="قيمة المشاريع المفتوحة"
              value={money(stats.openValue, { compact: true })}
              tint={palette.sageSoft}
            />
            <StatTile
              icon={<Wallet size={18} color={palette.terracotta} />}
              label="متبقٍ للتحصيل"
              value={money(stats.due, { compact: true })}
              tint={palette.terracottaSoft}
            />
          </Row>
          <Row gap={spacing.md}>
            <StatTile
              icon={<Banknote size={18} color={palette.success} />}
              label="تحصيل هذا الشهر"
              value={money(stats.collected, { compact: true })}
              tint={palette.successSoft}
            />
            <StatTile
              icon={<Package size={18} color={palette.info} />}
              label="رولات في المخزن"
              value={`${rolls.length}`}
              tint={palette.infoSoft}
            />
          </Row>
        </View>

        {pendingDiscounts.length > 0 && (
          <Banner
            tone="warning"
            title={`${pendingDiscounts.length} طلب خصم بانتظار قرارك`}
            body={`أعلى نسبة مطلوبة: ${Math.max(...pendingDiscounts.map((d) => d.requestedPercent))}%`}
            icon={<BadgePercent size={18} color={palette.warning} />}
            action={
              <Button
                label="مراجعة الطلبات"
                variant="secondary"
                small
                onPress={() => router.push('/discounts')}
              />
            }
          />
        )}

        {lowStock.length > 0 && (
          <Banner
            tone="danger"
            title="مخزون منخفض"
            body={lowStock.map((r) => `${r.roll.code}: ${r.balance.availableM} م`).join(' • ')}
            icon={<AlertTriangle size={18} color={palette.danger} />}
            action={
              <Button
                label="فتح المخزون"
                variant="secondary"
                small
                onPress={() => router.push('/inventory')}
              />
            }
          />
        )}

        <View>
          <SectionHeader title="خط الإنتاج" subtitle="توزيع المشاريع على مراحل دورة الحياة" />
          <Card>
            <PipelineChart />
          </Card>
        </View>

        <View>
          <SectionHeader
            title="مشاريع تحتاج متابعة"
            action={
              <Pressable onPress={() => router.push('/projects')}>
                <Row gap={4}>
                  <AppText variant="label" color={palette.olive}>
                    الكل
                  </AppText>
                  <ChevronLeft size={16} color={palette.olive} />
                </Row>
              </Pressable>
            }
          />
          <View style={{ gap: spacing.md }}>
            {hotProjects.map((p) => (
              <ProjectRow key={p.id} projectId={p.id} />
            ))}
          </View>
        </View>

        {todayVisits.length > 0 && (
          <View>
            <SectionHeader title="زيارات اليوم" subtitle={formatDate(new Date().toISOString())} />
            <View style={{ gap: spacing.md }}>
              {todayVisits.map((v) => {
                const project = db.projects.find((p) => p.id === v.projectId);
                const customer = db.customers.find((c) => c.id === project?.customerId);
                return (
                  <Card key={v.id} onPress={() => router.push(`/visit/${v.id}`)}>
                    <Row justify="space-between">
                      <View style={{ flex: 1 }}>
                        <AppText variant="heading">{customer?.fullName}</AppText>
                        <AppText variant="caption" color={palette.muted}>
                          {VISIT_TYPE_LABELS[v.type]} • {formatTime(v.scheduledAt)} •{' '}
                          {customer?.city}
                        </AppText>
                      </View>
                      <CalendarClock size={20} color={palette.olive} />
                    </Row>
                  </Card>
                );
              })}
            </View>
          </View>
        )}

        <View>
          <SectionHeader
            title="آخر النشاطات"
            subtitle="سجل التدقيق"
            action={
              <Pressable onPress={() => router.push('/audit')}>
                <AppText variant="label" color={palette.olive}>
                  عرض السجل
                </AppText>
              </Pressable>
            }
          />
          <Card>
            {db.auditLogs.slice(0, 4).map((log, i) => (
              <View key={log.id}>
                <Row gap={spacing.md} align="flex-start">
                  <View style={styles.auditDot} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{log.summary}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      {db.profiles.find((p) => p.id === log.actorId)?.fullName ?? 'النظام'} •{' '}
                      {formatDate(log.createdAt)}
                    </AppText>
                  </View>
                </Row>
                {i < 3 && <View style={styles.auditLine} />}
              </View>
            ))}
          </Card>
        </View>

        <AppText variant="caption" color={palette.muted} align="center">
          {currentUser?.fullName} — صلاحية كاملة على مؤسسة {db.organization.name}
        </AppText>
      </View>
    </ScrollView>
  );
}

function PipelineChart() {
  const { db } = useStore();
  const groups = useMemo(() => {
    const buckets: { label: string; statuses: string[]; color: string }[] = [
      {
        label: 'قياس',
        statuses: ['new_request', 'awaiting_measurement', 'measured'],
        color: palette.warning,
      },
      { label: 'عرض سعر', statuses: ['quotation', 'customer_approved'], color: palette.info },
      { label: 'إنتاج', statuses: ['fabric_allocated', 'with_tailor'], color: palette.terracotta },
      { label: 'تركيب', statuses: ['ready_for_install', 'installed'], color: palette.olive },
      { label: 'مكتمل', statuses: ['completed'], color: palette.success },
    ];
    const total = db.projects.length || 1;
    return buckets.map((b) => {
      const count = db.projects.filter((p) => b.statuses.includes(p.status)).length;
      return { ...b, count, ratio: count / total };
    });
  }, [db.projects]);

  return (
    <View style={{ gap: spacing.md }}>
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 6 }}>
          <Row justify="space-between">
            <AppText variant="label">{g.label}</AppText>
            <AppText variant="label" color={palette.muted}>
              {g.count}
            </AppText>
          </Row>
          <ProgressBar value={g.ratio} color={g.color} />
        </View>
      ))}
    </View>
  );
}

function FieldDashboard() {
  const { db, currentUser } = useStore();
  const router = useRouter();
  const today = new Date();

  const myVisits = db.fieldVisits
    .filter((v) => v.assigneeId === currentUser?.id && v.status !== 'completed')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const todays = myVisits.filter((v) => isSameDay(v.scheduledAt, today));
  const upcoming = myVisits.filter((v) => !isSameDay(v.scheduledAt, today));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader subtitle={`لديك ${todays.length} زيارة اليوم و ${upcoming.length} قادمة`} />
      <View style={{ padding: spacing.lg, gap: spacing.xl }}>
        <View>
          <SectionHeader title="زيارات اليوم" subtitle={formatDate(today.toISOString())} />
          {todays.length === 0 ? (
            <Card>
              <AppText variant="body" color={palette.muted} align="center">
                لا توجد زيارات اليوم — استمتع بيومك.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {todays.map((v) => (
                <VisitCard key={v.id} visitId={v.id} />
              ))}
            </View>
          )}
        </View>

        {upcoming.length > 0 && (
          <View>
            <SectionHeader title="زيارات قادمة" />
            <View style={{ gap: spacing.md }}>
              {upcoming.map((v) => (
                <VisitCard key={v.id} visitId={v.id} />
              ))}
            </View>
          </View>
        )}

        <Button
          label="فتح كل مشاريعي"
          variant="ghost"
          full
          icon={<ArrowLeft size={18} color={palette.olive} />}
          onPress={() => router.push('/projects')}
        />
      </View>
    </ScrollView>
  );
}

function TailorDashboard() {
  const { db, currentUser } = useStore();
  const router = useRouter();
  const mine = db.tailorAssignments.filter(
    (a) => a.tailorId === currentUser?.id && a.stage !== 'ready',
  );
  const done = db.tailorAssignments.filter(
    (a) => a.tailorId === currentUser?.id && a.stage === 'ready',
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader subtitle={`${mine.length} أمر إنتاج قيد التنفيذ`} />
      <View style={{ padding: spacing.lg, gap: spacing.xl }}>
        <View>
          <SectionHeader title="أوامر الإنتاج" subtitle="مشاريعك فقط" />
          <View style={{ gap: spacing.md }}>
            {mine.map((a) => (
              <TailorCard key={a.id} assignmentId={a.id} />
            ))}
            {mine.length === 0 && (
              <Card>
                <AppText variant="body" color={palette.muted} align="center">
                  لا توجد أوامر إنتاج مفتوحة حاليًا.
                </AppText>
              </Card>
            )}
          </View>
        </View>

        {done.length > 0 && (
          <View>
            <SectionHeader title="جاهز للتسليم" />
            <View style={{ gap: spacing.md }}>
              {done.map((a) => (
                <TailorCard key={a.id} assignmentId={a.id} />
              ))}
            </View>
          </View>
        )}

        <Button
          label="فتح قائمة الإنتاج"
          variant="ghost"
          full
          icon={<Scissors size={18} color={palette.olive} />}
          onPress={() => router.push('/tasks')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  auditDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.terracotta,
    marginTop: 8,
  },
  auditLine: { height: 1, backgroundColor: palette.line, marginVertical: spacing.md },
});
