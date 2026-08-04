import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgePercent,
  Bell,
  ChevronLeft,
  Clock3,
  FolderPlus,
  Layers,
  LayoutGrid,
  Package,
  Scissors,
  UserPlus,
} from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing as REasing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppHeader } from '@/components/AppHeader';
import { ProjectRow, TailorCard, VisitCard } from '@/components/cards';
import { CountUpText, Enter, MiniBars, RingStat, StackedBar } from '@/components/dashviz';
import {
  AppText,
  Button,
  Card,
  Divider,
  Row,
  SectionHeader,
  Skeleton,
} from '@/components/ui';
import { gradients, palette, radius, shadow, spacing } from '@/constants/theme';
import { LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { useRollViews } from '@/hooks/selectors';
import { formatDate, initials, isSameDay, money } from '@/lib/format';
import { useStore } from '@/providers/store';

/* لوحة 2026: خلفية لافندرية بتوهجات، بطاقة بطل متدرّجة بهالة ملوّنة،
   مربعات إجراءات متدرّجة، وزجاج جراحي لبقية البطاقات. */
const paper = palette.ivory;

/** مواقيت الدخول — مصدر واحد يشاركه الظهور وحركات الأرقام فتبدأ من الصفر معًا. */
const ENTER = { hero: 60, quick: 160, tiles: 240, charts: 340, attention: 430, pipeline: 520, projects: 610 } as const;

const QUICK_ACTIONS = [
  { key: 'project', label: 'مشروع جديد', icon: FolderPlus, grad: gradients.indigo, href: '/project/new' },
  { key: 'customer', label: 'زبون جديد', icon: UserPlus, grad: gradients.sky, href: '/customer/new' },
  { key: 'inventory', label: 'المخزون', icon: Layers, grad: gradients.emerald, href: '/inventory' },
  { key: 'discounts', label: 'الخصومات', icon: BadgePercent, grad: gradients.amber, href: '/discounts' },
] as const;

function QuickActions() {
  const router = useRouter();
  return (
    <Row gap={spacing.md}>
      {QUICK_ACTIONS.map((a, i) => {
        const Icon = a.icon;
        return (
          <Animated.View key={a.key} entering={FadeInDown.delay(ENTER.quick + i * 60).duration(430)} style={{ flex: 1 }}>
            <Pressable
              onPress={() => router.push(a.href)}
              style={({ pressed }) => [
                { alignItems: 'center', gap: 6 },
                pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 },
              ]}
            >
              <LinearGradient
                colors={a.grad as unknown as [string, string]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.quickTile}
              >
                <Icon size={22} color={palette.white} />
              </LinearGradient>
              <AppText variant="caption" color={palette.charcoal} numberOfLines={1} style={{ fontSize: 12 }}>
                {a.label}
              </AppText>
            </Pressable>
          </Animated.View>
        );
      })}
    </Row>
  );
}

/**
 * ضوء شفقي ينجرف ببطء داخل البطاقة. صار تدرّجًا شعاعيًا (SoftGlow) لا قرصًا
 * مصمتًا، فلم يعد يحتاج طبقة تمويه فوقه لإذابة حوافه — ولذلك أمكن إبقاء
 * الشفق حادًا وملوّنًا خلف الشريحتين الزجاجيتين، فيصير لتمويههما ما يطمسه
 * ويظهر أثر الزجاج فعلًا. التحريك transform حصرًا: 60 إطارًا بلا كلفة.
 */
function AuroraBloom({
  id,
  color,
  size,
  peak,
  style,
  duration,
  dx,
  dy,
  grow = 0.2,
  delay = 0,
}: {
  id: string;
  color: string;
  size: number;
  peak: number;
  style: StyleProp<ViewStyle>;
  duration: number;
  dx: number;
  dy: number;
  grow?: number;
  delay?: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: REasing.inOut(REasing.sin) }), -1, true),
    );
  }, [p, duration, delay]);
  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: p.value * dx },
      { translateY: p.value * dy },
      { scale: 1 + p.value * grow },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size }, style, drift]}
    >
      <SoftGlow id={id} color={color} size={size} peak={peak} style={{ top: 0, left: 0 }} />
    </Animated.View>
  );
}

/**
 * هالة خلفية بتدرّج شعاعيّ أملس (SVG RadialGradient) — لا دوائر متراكبة
 * تُنتج حلقات مرئية، بل انحدار متصل من مركز مضيء إلى شفافية تامة عند
 * المحيط. محطات الانحدار غير خطية عمدًا (كثيفة قرب المركز) فيبدو التلاشي
 * طبيعيًا كضوء حقيقي لا كتدرّج حسابي.
 */
function SoftGlow({
  id,
  color,
  size,
  peak = 0.5,
  style,
}: {
  id: string;
  color: string;
  size: number;
  /** شفافية القلب المضيء. */
  peak?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={peak} />
            <Stop offset="30%" stopColor={color} stopOpacity={peak * 0.62} />
            <Stop offset="55%" stopColor={color} stopOpacity={peak * 0.3} />
            <Stop offset="78%" stopColor={color} stopOpacity={peak * 0.1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * لوح زجاجي بوصفة العرض الكاملة — لأن الإعتام وحده لا يصنع زجاجًا، بل
 * يقتله: كل 10% بياض إضافي تحجب 10% من الضوء المموَّه خلفه. صلابة المظهر
 * تأتي من الطبقات لا من الكثافة:
 *   تمويه ← ملء خفيف ← بريق علوي متدرّج ← خط ضوء عند الحافة العليا ← حدّ.
 */
function GlassChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.heroChip}>
      <BlurView
        intensity={40}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroChipFill} />
      <LinearGradient
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.heroChipSheen} />
      {children}
    </View>
  );
}

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

    // متوسط هامش المعتمد هذا الشهر (وإلا كل المعتمد) — للأدمن والمبيعات فقط
    const approvedAll = db.quotationVersions.filter((v) => v.status === 'approved');
    const approvedThisMonth = approvedAll.filter(
      (v) => v.approvedAt && new Date(v.approvedAt) >= monthStart,
    );
    const marginPool = approvedThisMonth.length > 0 ? approvedThisMonth : approvedAll;
    const marginAvg =
      marginPool.length > 0
        ? marginPool.reduce((s, v) => s + v.marginPercent, 0) / marginPool.length
        : 0;

    // اعتمادات آخر 6 أشهر — أعمدة اتجاه مصغّرة (تسميات لاتينية لرقم الشهر)
    const sixMonths: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      const sum = approvedAll
        .filter((v) => {
          if (!v.approvedAt) return false;
          const t = new Date(v.approvedAt);
          return t >= d && t < next;
        })
        .reduce((s, v) => s + v.totalAgorot, 0);
      sixMonths.push({ label: `${d.getMonth() + 1}`, value: sum });
    }

    return {
      approvedMonth,
      awaiting,
      awaitingValue,
      activeCount: active.length,
      reservedM,
      marginAvg,
      sixMonths,
    };
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
      {/* هالات الخلفية: تدرّج شعاعيّ أملس يذوب في الورق بلا حافة.
          الذروة عالية عمدًا لأن الانحدار يلتهم معظمها بسرعة — القيمة
          المرئية على المساحة هي نحو ثلث الذروة. */}
      <SoftGlow id="glowSkyTop" color="#38BDF8" peak={0.2} size={600} style={{ top: -200, right: -170 }} />
      <SoftGlow id="glowSky" color="#38BDF8" peak={0.14} size={520} style={{ top: 300, left: -190 }} />
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

        {/* بطاقة البطل — زجاج حقيقي فوق ضوء ملوّن (نفس مبدأ الشريط السفلي) */}
        <Enter delay={ENTER.hero}>
        <Pressable
          onPress={() => router.push('/projects')}
          style={({ pressed }) => [shadow.glow, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        >
        <View style={styles.hero}>
          {/* ما تحت الزجاج: تدرّج + ضوءان منتشران — الزجاج يذيب حوافهما */}
          <LinearGradient
            colors={gradients.hero as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* أضواء شعاعية مشبعة — حادة عمدًا (بلا تمويه فوقها) كي تمنح
              زجاج الشريحتين ما يطمسه. مساراتها مضبوطة على النطاق الأوسط
              والسفلي من البطاقة (حيث تجلس الشريحتان) فتعبر خلفهما فعلًا. */}
          <AuroraBloom
            id="hb1"
            color="#38BDF8"
            peak={0.9}
            size={280}
            style={{ top: 20, left: -150 }}
            duration={9000}
            dx={230}
            dy={26}
            grow={0.28}
          />
          <AuroraBloom
            id="hb2"
            color="#FB7185"
            peak={0.85}
            size={280}
            style={{ top: 60, right: -150 }}
            duration={12500}
            dx={-215}
            dy={-24}
            grow={0.32}
            delay={900}
          />
          <AuroraBloom
            id="hb3"
            color="#FDCD69"
            peak={0.6}
            size={230}
            style={{ top: 55, left: 30 }}
            duration={15000}
            dx={130}
            dy={-34}
            grow={0.26}
            delay={2000}
          />
          {/* بريق يعبر ببطء خلف الشريحتين — لمعة المادة */}
          <AuroraBloom
            id="hb4"
            color="#FFFFFF"
            peak={0.5}
            size={200}
            style={{ top: 45, right: -60 }}
            duration={18000}
            dx={-230}
            dy={22}
            grow={0.18}
            delay={3200}
          />
          {/* ستارة خفيفة تعيد العمق وتضمن وضوح النص */}
          <View style={styles.heroScrim} />
          <View style={styles.heroContent}>
          <AppText variant="caption" color="rgba(255,255,255,0.78)">
            اعتمادات هذا الشهر
          </AppText>
          <CountUpText
            value={stats.approvedMonth}
            format={(v) => money(v, { compact: true })}
            color={palette.white}
            style={{ fontSize: 40, lineHeight: 56 }}
            delay={ENTER.hero}
          />

          <Row gap={spacing.md} style={{ marginTop: spacing.lg }}>
            <GlassChip>
              <View style={[styles.heroChipIcon, { backgroundColor: palette.success }]}>
                <ArrowUpRight size={14} color={palette.white} />
              </View>
              <View>
                <AppText variant="caption" color="rgba(27,31,50,0.62)" style={{ fontSize: 12 }}>
                  عروض معتمدة
                </AppText>
                <AppText variant="label" color={palette.charcoal}>
                  {db.quotationVersions.filter((v) => v.status === 'approved').length}
                </AppText>
              </View>
            </GlassChip>
            <GlassChip>
              <View style={[styles.heroChipIcon, { backgroundColor: palette.warning }]}>
                <Clock3 size={14} color={palette.white} />
              </View>
              <View>
                <AppText variant="caption" color="rgba(27,31,50,0.62)" style={{ fontSize: 12 }}>
                  بانتظار الرد
                </AppText>
                <AppText variant="label" color={palette.charcoal}>
                  {stats.awaiting.length > 0
                    ? `${stats.awaiting.length} • ${money(stats.awaitingValue, { compact: true })}`
                    : '—'}
                </AppText>
              </View>
            </GlassChip>
          </Row>
          </View>
        </View>
        </Pressable>
        </Enter>

        {/* مربعات الإجراءات السريعة — نمط 2026 */}
        <QuickActions />

        {/* بلاطات زجاجية — اللون في دائرة الأيقونة فقط */}
        <Enter delay={ENTER.tiles}>
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
        </Enter>

        {/* كسر الروتين: حلقة الهامش + اتجاه 6 أشهر */}
        <Enter delay={ENTER.charts}>
          <Row gap={spacing.md} align="stretch">
            <Glass style={{ flex: 1 }} inner={{ padding: spacing.md, alignItems: 'center', justifyContent: 'center' }}>
              <RingStat
                percent={stats.marginAvg}
                color={stats.marginAvg >= db.settings.minMarginPercent ? palette.olive : palette.danger}
                label="متوسط هامش المعتمد"
                delay={ENTER.charts}
              />
            </Glass>
            <Glass style={{ flex: 1.5 }} inner={{ padding: spacing.md, justifyContent: 'flex-end', gap: spacing.sm }}>
              <AppText variant="caption" color={palette.muted}>
                اعتمادات آخر 6 أشهر
              </AppText>
              <MiniBars data={stats.sixMonths} delay={ENTER.charts} />
            </Glass>
          </Row>
        </Enter>

        {attention.length > 0 && (
          <Enter delay={ENTER.attention}>
            <SectionHeader title="يحتاج انتباهك" />
            <Glass inner={{ padding: 0 }}>
              {attention.map((a, i) => (
                <View key={a.key}>
                  <Pressable
                    onPress={a.onPress}
                    style={({ pressed }) => [
                      styles.attentionRow,
                      pressed && { backgroundColor: 'rgba(79,70,229,0.06)' },
                    ]}
                  >
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
          </Enter>
        )}

        <Enter delay={ENTER.pipeline}>
          <SectionHeader title="خط الإنتاج" subtitle="أين تقف مشاريعك الآن" />
          <Glass>
            <PipelineChart />
          </Glass>
        </Enter>

        <Enter delay={ENTER.projects}>
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
        </Enter>
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
    <StackedBar
      segments={groups.map((g) => ({ label: g.label, count: g.count, color: g.color }))}
      delay={ENTER.pipeline}
    />
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
    backgroundColor: palette.sand,
    borderWidth: 1.5,
    borderColor: palette.sandDeep,
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
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroContent: {
    padding: spacing.xl,
    gap: 2,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40,32,110,0.22)',
  },
  /** زجاج حقيقي: تمويه داخلي + طبقة بيضاء + حدّ مضيء (glassmorphism). */
  heroChip: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  heroChipFill: {
    ...StyleSheet.absoluteFillObject,
    // خفيف عمدًا: كل زيادة هنا تحجب الضوء المموَّه — الصلابة من البريق
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  /** خط ضوء عند الحافة العليا — انكسار الضوء على حرف الزجاج. */
  heroChipSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  quickTile: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 66,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroChipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    // أكثف قليلًا بعد تخفيف التوهجات — الزجاج يبقى واضحًا بلا وميض خلفه
    backgroundColor: 'rgba(255,255,255,0.72)',
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
