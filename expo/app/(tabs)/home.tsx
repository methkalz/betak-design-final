import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  Bell,
  ChevronLeft,
  Clock3,
  Layers,
  LayoutGrid,
  Package,
  Scissors,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { ProjectRow, TailorCard, VisitCard } from '@/components/cards';
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
import { formatDate, initials, isSameDay, money } from '@/lib/format';
import { useStore } from '@/providers/store';

/* «نمط المحفظة الزجاجي» — تجربة معزولة في هذه الشاشة:
   خلفية محيطية بتوهجات لونية ناعمة، بطاقة داكنة برقم واحد كبير،
   وبطاقات زجاجية (blur) لكل ما عداها. حرية عن الهوية بقرار المالك. */
const paper = '#F3F4F0';
const inkCard = '#1C221B';
const heroGreen = '#A9CBB0';
const heroAmber = '#E4BE84';

function Glass({
  children,
  style,
  inner,
}: {
  children: React.ReactNode;
  style?: object;
  inner?: object;
}) {
  return (
    <View style={[styles.glassWrap, style]}>
      <BlurView
        intensity={30}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glassInner, inner]}>{children}</View>
    </View>
  );
}

function GlassTile({
  color,
  icon,
  value,
  unit,
  label,
}: {
  color: string;
  icon: React.ReactNode;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <Glass style={{ flex: 1 }} inner={styles.glassTileInner}>
      <View style={[styles.glassTileIcon, { backgroundColor: color }]}>{icon}</View>
      <Row gap={4} align="baseline">
        <AppText variant="number">{value}</AppText>
        {!!unit && (
          <AppText variant="caption" color={palette.muted} style={{ fontSize: 12 }}>
            {unit}
          </AppText>
        )}
      </Row>
      <AppText variant="caption" color={palette.muted} numberOfLines={1} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </Glass>
  );
}

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
      title: `${expiringSoon.length} عرض تنتهي صلاحيته خلال 3 أيام`,
      sub: 'تواصل مع الزبون قبل الانقضاء',
      onPress: () => router.push('/projects'),
    });
  if (lowStock.length > 0)
    attention.push({
      key: 'stock',
      icon: <AlertTriangle size={17} color={palette.danger} />,
      tint: palette.dangerSoft,
      title: `${lowStock.length} ${lowStock.length === 1 ? 'رول' : 'رولات'} تحت حد المخزون`,
      sub: lowStock
        .slice(0, 3)
        .map((r) => `${r.roll.code}: ${r.balance.availableM} م`)
        .join(' • '),
      onPress: () => router.push('/inventory'),
    });

  const insets = useSafeAreaInsets();
  const { currentUser } = useStore();
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'صباح الخير' : hour < 17 ? 'نهارك سعيد' : 'مساء الخير';

  return (
    <View style={{ flex: 1, backgroundColor: paper }}>
      {/* توهجات محيطية خلف الزجاج */}
      <View style={[styles.blob, { backgroundColor: 'rgba(168,185,165,0.4)', top: -70, right: -60 }]} />
      <View style={[styles.blob, { backgroundColor: 'rgba(228,190,132,0.3)', top: 260, left: -90, width: 220, height: 220, borderRadius: 110 }]} />
      <View style={[styles.blob, { backgroundColor: 'rgba(200,121,91,0.18)', bottom: 60, right: -70, width: 190, height: 190, borderRadius: 95 }]} />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 130, paddingTop: insets.top + spacing.md }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xl }}>
        {/* التحية — على الصفحة مباشرة، لا شريط ملوّن */}
        <Row justify="space-between">
          <Row gap={spacing.md}>
            <View style={styles.avatar}>
              <AppText variant="label" color={palette.oliveDark}>
                {initials(currentUser?.fullName ?? '')}
              </AppText>
            </View>
            <View>
              <AppText variant="caption" color={palette.muted}>
                {hello} 👋
              </AppText>
              <AppText variant="heading">{currentUser?.fullName ?? ''}</AppText>
            </View>
          </Row>
          <Pressable onPress={() => router.push('/notifications')} style={styles.bellBtn}>
            <Bell size={19} color={palette.charcoal} />
          </Pressable>
        </Row>

        {/* بطاقة المحفظة الداكنة — رقم واحد كبير يفتتح اليوم */}
        <Pressable onPress={() => router.push('/projects')} style={styles.hero}>
          <View style={[styles.heroDot, { backgroundColor: palette.terracotta, top: 18, left: 22 }]} />
          <View
            style={[styles.heroDot, { backgroundColor: heroGreen, width: 9, height: 9, top: 34, left: 40 }]}
          />
          <AppText variant="caption" color="rgba(255,255,255,0.55)">
            اعتمادات هذا الشهر
          </AppText>
          <AppText variant="numberLarge" color={palette.white} style={{ fontSize: 38, lineHeight: 52 }}>
            {money(stats.approvedMonth, { compact: true })}
          </AppText>

          <Row gap={spacing.md} style={{ marginTop: spacing.lg }}>
            <View style={styles.heroChip}>
              <View style={[styles.heroChipIcon, { backgroundColor: 'rgba(169,203,176,0.18)' }]}>
                <ArrowUpRight size={14} color={heroGreen} />
              </View>
              <View>
                <AppText variant="caption" color="rgba(255,255,255,0.5)" style={{ fontSize: 11 }}>
                  عروض معتمدة
                </AppText>
                <AppText variant="label" color={heroGreen}>
                  {db.quotationVersions.filter((v) => v.status === 'approved').length}
                </AppText>
              </View>
            </View>
            <View style={styles.heroChip}>
              <View style={[styles.heroChipIcon, { backgroundColor: 'rgba(228,190,132,0.16)' }]}>
                <Clock3 size={14} color={heroAmber} />
              </View>
              <View>
                <AppText variant="caption" color="rgba(255,255,255,0.5)" style={{ fontSize: 11 }}>
                  بانتظار الرد
                </AppText>
                <AppText variant="label" color={heroAmber}>
                  {stats.awaiting.length > 0
                    ? `${stats.awaiting.length} • ${money(stats.awaitingValue, { compact: true })}`
                    : '—'}
                </AppText>
              </View>
            </View>
          </Row>
        </Pressable>

        {/* بلاطات زجاجية — اللون في دائرة الأيقونة فقط */}
        <Row gap={spacing.md}>
          <GlassTile
            color={palette.olive}
            icon={<LayoutGrid size={15} color={palette.white} />}
            value={`${stats.activeCount}`}
            label="مشاريع نشطة"
          />
          <GlassTile
            color={palette.terracotta}
            icon={<Package size={15} color={palette.white} />}
            value={`${Math.round(stats.reservedM * 10) / 10}`}
            unit="متر"
            label="قماش محجوز"
          />
          <GlassTile
            color={lowStock.length > 0 ? palette.danger : palette.info}
            icon={
              lowStock.length > 0 ? (
                <AlertTriangle size={15} color={palette.white} />
              ) : (
                <Layers size={15} color={palette.white} />
              )
            }
            value={`${lowStock.length}`}
            label="رولات تحت الحد"
          />
        </Row>

        {attention.length > 0 && (
          <View>
            <SectionHeader title="يحتاج انتباهك" />
            <Glass inner={{ padding: 0 }}>
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
                  {i < attention.length - 1 && (
                    <Divider style={{ marginVertical: 0, marginHorizontal: spacing.lg, backgroundColor: 'rgba(0,0,0,0.05)' }} />
                  )}
                </View>
              ))}
            </Glass>
          </View>
        )}

        <View>
          <SectionHeader title="خط الإنتاج" subtitle="أين تقف مشاريعك الآن" />
          <Glass>
            <PipelineChart />
          </Glass>
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
    </View>
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
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: inkCard,
    borderRadius: 28,
    padding: spacing.xl,
    gap: 2,
    overflow: 'hidden',
  },
  heroDot: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    opacity: 0.95,
  },
  heroChip: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroChipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  glassWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  glassInner: {
    padding: spacing.lg,
  },
  glassTileInner: {
    padding: spacing.md,
    minHeight: 108,
    justifyContent: 'flex-end',
    gap: 1,
  },
  glassTileIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
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
