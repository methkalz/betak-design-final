import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  BadgePercent,
  ChevronLeft,
  Clock3,
  Layers,
  LayoutGrid,
  Package,
  Scissors,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { ProjectRow, StatTile, TailorCard, VisitCard } from '@/components/cards';
import {
  AppText,
  Button,
  Card,
  Divider,
  ProgressBar,
  Row,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { useRollViews } from '@/hooks/selectors';
import { formatDate, isSameDay, money } from '@/lib/format';
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
  const { db } = useStore();
  const router = useRouter();
  const rolls = useRollViews();

  // أرقام المالك من مصادر موثوقة في الوضعين (العروض لا الدفعات —
  // الدفعات تصل في شريحة لاحقة): اعتمادات الشهر، وما ينتظر رد الزبون.
  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const now = Date.now();

    const approvedMonth = db.quotationVersions
      .filter((v) => v.status === 'approved' && v.approvedAt && new Date(v.approvedAt) >= monthStart)
      .reduce((s, v) => s + v.totalAgorot, 0);

    const awaiting = db.quotationVersions.filter(
      (v) => v.status === 'sent' && new Date(v.validUntil).getTime() >= now,
    );
    const awaitingValue = awaiting.reduce((s, v) => s + v.totalAgorot, 0);

    const active = db.projects.filter((p) => p.status !== 'completed');

    const reservedM = db.reservations
      .filter((r) => r.status === 'active' || r.status === 'partially_consumed')
      .reduce(
        (s, r) => s + Math.max(0, r.quantityM - r.consumedM - (r.releasedM ?? 0) - (r.damagedReservedM ?? 0)),
        0,
      );

    return { approvedMonth, awaiting, awaitingValue, activeCount: active.length, reservedM };
  }, [db.quotationVersions, db.projects, db.reservations]);

  const pendingDiscounts = db.discountRequests.filter((d) => d.status === 'pending');
  const lowStock = rolls.filter(
    (r) => r.balance.availableM < LOW_STOCK_THRESHOLD_M && !r.roll.isMiniRoll,
  );
  const expiringSoon = useMemo(() => {
    const soon = Date.now() + 3 * 24 * 60 * 60 * 1000;
    return db.quotationVersions.filter(
      (v) =>
        v.status === 'sent' &&
        new Date(v.validUntil).getTime() >= Date.now() &&
        new Date(v.validUntil).getTime() <= soon,
    );
  }, [db.quotationVersions]);

  const hotProjects = useMemo(
    () =>
      db.projects
        .filter((p) => p.status !== 'completed')
        .sort((a, b) => (a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0))
        .slice(0, 3),
    [db.projects],
  );

  const attention: {
    key: string;
    icon: React.ReactNode;
    tint: string;
    title: string;
    sub: string;
    onPress: () => void;
  }[] = [];
  if (pendingDiscounts.length > 0)
    attention.push({
      key: 'discounts',
      icon: <BadgePercent size={17} color={palette.warning} />,
      tint: palette.warningSoft,
      title: `${pendingDiscounts.length} طلب خصم بانتظار قرارك`,
      sub: `أعلى نسبة مطلوبة ${Math.max(...pendingDiscounts.map((d) => d.requestedPercent))}%`,
      onPress: () => router.push('/discounts'),
    });
  if (expiringSoon.length > 0)
    attention.push({
      key: 'expiring',
      icon: <Clock3 size={17} color={palette.info} />,
      tint: palette.infoSoft,
      title: `${expiringSoon.length} عرض تنتهي صلاحيته خلال ٣ أيام`,
      sub: 'تواصل مع الزبون قبل الانقضاء',
      onPress: () => router.push('/projects'),
    });
  if (lowStock.length > 0)
    attention.push({
      key: 'stock',
      icon: <AlertTriangle size={17} color={palette.danger} />,
      tint: palette.dangerSoft,
      title: `${lowStock.length} بكرة تحت حد المخزون`,
      sub: lowStock
        .slice(0, 3)
        .map((r) => `${r.roll.code}: ${r.balance.availableM} م`)
        .join(' • '),
      onPress: () => router.push('/inventory'),
    });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.ivory }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <AppHeader subtitle={`${db.organization.name} • ${formatDate(new Date().toISOString())}`} />

      <View style={{ padding: spacing.lg, gap: spacing.xxl }}>
        {/* بطاقة المالك — رقم واحد كبير يفتتح اليوم */}
        <Pressable onPress={() => router.push('/projects')} style={styles.hero}>
          <AppText variant="label" color={palette.sage}>
            اعتمادات هذا الشهر
          </AppText>
          <AppText variant="numberLarge" color={palette.ivory} style={{ fontSize: 34, lineHeight: 46 }}>
            {money(stats.approvedMonth, { compact: true })}
          </AppText>
          <View style={styles.heroDivider} />
          <Row justify="space-between">
            <AppText variant="caption" color={palette.sage}>
              بانتظار رد الزبون
            </AppText>
            <AppText variant="label" color={palette.ivory}>
              {stats.awaiting.length > 0
                ? `${stats.awaiting.length} عروض • ${money(stats.awaitingValue, { compact: true })}`
                : 'لا عروض معلقة'}
            </AppText>
          </Row>
        </Pressable>

        {/* ثلاث إشارات هادئة */}
        <Row gap={spacing.md}>
          <StatTile
            icon={<LayoutGrid size={16} color={palette.olive} />}
            label="مشاريع نشطة"
            value={`${stats.activeCount}`}
            tint={palette.sageSoft}
          />
          <StatTile
            icon={<Package size={16} color={palette.terracotta} />}
            label="قماش محجوز"
            value={`${Math.round(stats.reservedM * 10) / 10} م`}
            tint={palette.terracottaSoft}
          />
          <StatTile
            icon={<Layers size={16} color={lowStock.length > 0 ? palette.danger : palette.info} />}
            label="بكرات منخفضة"
            value={`${lowStock.length}`}
            tint={lowStock.length > 0 ? palette.dangerSoft : palette.infoSoft}
          />
        </Row>

        {attention.length > 0 && (
          <View>
            <SectionHeader title="يحتاج انتباهك" />
            <Card padded={false}>
              {attention.map((a, i) => (
                <View key={a.key}>
                  <Pressable onPress={a.onPress} style={styles.attentionRow}>
                    <View style={[styles.attentionIcon, { backgroundColor: a.tint }]}>{a.icon}</View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <AppText variant="label">{a.title}</AppText>
                      <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                        {a.sub}
                      </AppText>
                    </View>
                    <ChevronLeft size={17} color={palette.muted} />
                  </Pressable>
                  {i < attention.length - 1 && <Divider style={{ marginVertical: 0, marginHorizontal: spacing.lg }} />}
                </View>
              ))}
            </Card>
          </View>
        )}

        <View>
          <SectionHeader title="خط الإنتاج" subtitle="أين تقف مشاريعك الآن" />
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
          <ProgressBar value={g.ratio} color={g.color} height={6} />
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
  hero: {
    backgroundColor: palette.oliveDark,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: spacing.md,
  },
  attentionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  attentionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
