import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing as REasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Divider,
  EmptyState,
  Field,
  Pill,
  ProgressBar,
  Row,
  SectionHeader,
  SegmentedControl,
  Swatch,
} from '@/components/ui';
import { CheckWizard } from '@/components/CheckWizard';
import { QuotationDecision } from '@/components/QuotationDecision';
import { AdvanceButton } from '@/components/AdvanceButton';
import { TabPanel } from '@/components/TabMotion';
import { font, gradients, palette, radius, spacing } from '@/constants/theme';
import {
  ATTACHMENT_KIND_LABELS,
  CURTAIN_MODEL_LABELS,
  PROJECT_STATUS_HINTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  TAILOR_STAGE_LABELS,
  TRACK_LABELS,
  projectStatusColor,
  statusProgress,
} from '@/domain/labels';
import { can } from '@/domain/permissions';
import { round3 } from '@/domain/pricing';
import { currentVersion, projectFabricGaps, projectFinance, useProject } from '@/hooks/selectors';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useGoBack } from '@/lib/nav';
import { useStore } from '@/providers/store';
import type { ProjectStatus } from '@/types/domain';

type Tab = 'overview' | 'rooms' | 'quote' | 'production' | 'money' | 'media';

/** أسماء غرف شائعة في البيوت هنا - اقتراح لا حصر. */
const ROOM_SUGGESTIONS = [
  'الصالون',
  'غرفة الأهل',
  'غرفة الأولاد',
  'غرفة البنات',
  'غرفة الضيوف',
  'المطبخ',
  'المكتب',
] as const;

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'نظرة عامة' },
  { value: 'rooms', label: 'الغرف والشبابيك' },
  { value: 'quote', label: 'عرض السعر' },
  { value: 'production', label: 'القماش والإنتاج' },
  { value: 'money', label: 'الدفعات' },
  { value: 'media', label: 'الصور' },
];

export default function ProjectStudioScreen() {
  const { id, justCreated, tab: tabParam } = useLocalSearchParams<{
    id: string;
    justCreated?: string;
    tab?: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, role } = useStore();
  const project = useProject(id);
  const goBack = useGoBack('/projects');
  const [tab, setTab] = useState<Tab>(() =>
    TABS.some((t) => t.value === tabParam) ? (tabParam as Tab) : 'overview',
  );
  const tabsRef = useRef<ScrollView>(null);
  const tabsPinned = useRef(false);
  const bodyRef = useRef<ScrollView>(null);

  /**
   * بعد إنشاء المشروع تنتقل الشاشة إلى الغرف من نفسها.
   *
   * المهلة مقصودة لا كسل: الانتقال الفوري يبتلع اللحظة التي يتأكد فيها
   * المستخدم أن المشروع أُنشئ فعلًا فيبدو كأن شيئًا قفز أمامه، وما يتجاوز
   * الثانية يقطع تسلسل التفكير (حدّ نيلسن المعروف). 700 مللي ثانية تقع بين
   * الحدّين: يرى العنوان والزبون، ثم يجد نفسه حيث الخطوة التالية.
   */
  useEffect(() => {
    if (justCreated !== '1') return;
    const t = setTimeout(() => setTab('rooms'), 700);
    return () => clearTimeout(t);
  }, [justCreated]);

  /**
   * تمرير جسم الصفحة إلى بطاقة بعينها - تستعمله الغرف بعد الإضافة.
   * الإحداثي وارد من داخل لوح التبويب، وهو يبدأ بعد حشوة الصفحة، فالتمرير
   * إليه كما هو يترك تلك الحشوة فوق البطاقة هامشًا طبيعيًا.
   */
  const focusCard = useCallback((y: number) => {
    bodyRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, []);

  const resetScroll = useCallback(() => {
    bodyRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  /* مثبّتان بالمرجع لا محسوبان في كل رسم: يدخلان قائمة اعتماديات حركة
     الانتقال، ولو تغيّرت هويتهما مع كل رسم لأعادت الحركة نفسها من أولها في
     منتصف طريقها. */
  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        if (role === 'tailor') return ['overview', 'rooms', 'production'].includes(t.value);
        if (role === 'field') return ['overview', 'rooms', 'media'].includes(t.value);
        return true;
      }),
    [role],
  );
  const tabOrder = useMemo(() => visibleTabs.map((t) => t.value), [visibleTabs]);

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.ivory, paddingTop: insets.top + 60 }}>
        <EmptyState
          icon={<FileText size={26} color={palette.olive} />}
          title="المشروع غير موجود"
          body="ربما تم حذفه أو ليس ضمن صلاحياتك."
        />
      </View>
    );
  }

  const customer = db.customers.find((c) => c.id === project.customerId);
  const c = projectStatusColor(project.status);

  return (
    <View style={{ flex: 1, backgroundColor: palette.ivory }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[palette.oliveDeepest, palette.olive]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
      >
        <Row justify="space-between">
          <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
            <ArrowRight size={20} color={palette.ivory} />
          </Pressable>
          <Pill label={PROJECT_STATUS_LABELS[project.status]} bg="rgba(255,255,255,0.15)" fg={palette.ivory} />
        </Row>
        <View style={{ marginTop: spacing.lg, gap: 4 }}>
          <AppText variant="caption" color={palette.sage}>
            {project.code} • {customer?.city}
          </AppText>
          <AppText variant="title" color={palette.ivory}>
            {project.title}
          </AppText>
          <Pressable onPress={() => router.push(`/customer/${project.customerId}`)}>
            <Row gap={4}>
              <AppText variant="label" color={palette.sage}>
                {customer?.fullName}
              </AppText>
              <ChevronLeft size={14} color={palette.sage} />
            </Row>
          </Pressable>
        </View>
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <ProgressBar
            value={statusProgress(project.status)}
            color={palette.sage}
            track="rgba(255,255,255,0.15)"
            height={12}
          />
          <AppText variant="caption" color={palette.sage}>
            {PROJECT_STATUS_HINTS[project.status]}
          </AppText>
        </View>
      </LinearGradient>

      <TabBar tabs={visibleTabs} active={tab} onSelect={setTab} scrollRef={tabsRef} pinned={tabsPinned} />

      <ScrollView
        ref={bodyRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <TabPanel tab={tab} order={tabOrder} onSwap={resetScroll}>
          {(shown) => (
            <>
              {shown === 'overview' && <OverviewTab projectId={project.id} statusColor={c.fg} />}
              {shown === 'rooms' && <RoomsTab projectId={project.id} onFocusCard={focusCard} />}
              {shown === 'quote' && (
                <QuoteTab projectId={project.id} onGoToProduction={() => setTab('production')} />
              )}
              {shown === 'production' && <ProductionTab projectId={project.id} />}
              {shown === 'money' && <MoneyTab projectId={project.id} />}
              {shown === 'media' && <MediaTab projectId={project.id} />}
            </>
          )}
        </TabPanel>
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

type Edge = { x: number; w: number };

/**
 * الشريط والمؤشّر.
 *
 * المؤشّر عنصر واحد يسافر، لا خطٌّ يُطفأ تحت كلمة ويُشعل تحت أخرى - وهذا ما
 * يربط التبويبين في ذهن المستخدم بدل أن يبدوا شيئين منفصلين.
 *
 * وحافّتاه تتحرّكان بسرعتين مختلفتين: الحافّة التي تقود الحركة تصل أولًا
 * والتي تتبعها تتأخّر، فيتمدّد الخط قليلًا في الطريق ثم يستقرّ. هذه هي حيلة
 * مؤشّر Material، وهي ما يعطي الحركة إحساس المادة بدل انزلاق الصورة.
 */
function TabBar({
  tabs,
  active,
  onSelect,
  scrollRef,
  pinned,
}: {
  tabs: { value: Tab; label: string }[];
  active: Tab;
  onSelect: (t: Tab) => void;
  scrollRef: React.RefObject<ScrollView | null>;
  pinned: React.MutableRefObject<boolean>;
}) {
  const [edges, setEdges] = useState<Partial<Record<Tab, Edge>>>({});
  const stripW = useRef(0);
  const scrolledFor = useRef<Tab | null>(null);
  const start = useSharedValue(0);
  const end = useSharedValue(0);

  useEffect(() => {
    const e = edges[active];
    if (!e) return;
    const lead = { duration: 210, easing: REasing.out(REasing.cubic) };
    const trail = { duration: 300, easing: REasing.out(REasing.cubic) };
    if (end.value === 0) {
      // أول قياس: يوضع مكانه بلا سفر من الصفر
      start.value = e.x;
      end.value = e.x + e.w;
    } else if (e.x > start.value) {
      end.value = withTiming(e.x + e.w, lead);
      start.value = withTiming(e.x, trail);
    } else {
      start.value = withTiming(e.x, lead);
      end.value = withTiming(e.x + e.w, trail);
    }

    // إبقاء التبويب الفعّال داخل الرؤية - يلزم خاصةً حين تنتقل الشاشة وحدها
    if (stripW.current > 0 && scrolledFor.current !== active) {
      const first = scrolledFor.current === null;
      scrolledFor.current = active;
      scrollRef.current?.scrollTo({
        x: Math.max(0, e.x + e.w / 2 - stripW.current / 2),
        animated: !first,
      });
      pinned.current = true;
    }
  }, [active, edges, start, end, scrollRef, pinned]);

  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: start.value }],
    width: Math.max(0, end.value - start.value),
  }));

  return (
    <View style={{ backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.line }}>
      {/* row-reverse: أول تبويب أقصى اليمين كما يُقرأ العربي.
          الحشوة الجانبية فاصلان لا `paddingHorizontal`: المؤشّر عنصر مطلق
          يُوضع بـ`left: 0`، ولو كان للحاوية حشوة لاختلف مبدأ إحداثياته عن
          مبدأ قياسات التبويبات فانزاح الخط بمقدارها. */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          stripW.current = e.nativeEvent.layout.width;
        }}
        contentContainerStyle={{ gap: spacing.sm, flexDirection: 'row-reverse' }}
      >
        <View style={{ width: spacing.lg }} />
        {tabs.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => onSelect(t.value)}
            style={styles.tabBtn}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setEdges((prev) =>
                prev[t.value]?.x === x && prev[t.value]?.w === width
                  ? prev
                  : { ...prev, [t.value]: { x, w: width } },
              );
            }}
          >
            <AppText variant="label" color={active === t.value ? palette.olive : palette.muted}>
              {t.label}
            </AppText>
          </Pressable>
        ))}
        <View style={{ width: spacing.lg }} />
        <Animated.View pointerEvents="none" style={[styles.tabIndicator, indicator]} />
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function OverviewTab({ projectId, statusColor }: { projectId: string; statusColor: string }) {
  const { db, role, setProjectStatus } = useStore();
  const router = useRouter();
  const project = db.projects.find((p) => p.id === projectId)!;
  const [pending, setPending] = useState<{ to: ProjectStatus; back: boolean } | null>(null);
  const stageIndex = PROJECT_STATUS_ORDER.indexOf(project.status);
  const nextStatus = PROJECT_STATUS_ORDER[stageIndex + 1];
  const prevStatus = PROJECT_STATUS_ORDER[stageIndex - 1];
  const finance = projectFinance(db, projectId);
  const rooms = db.rooms.filter((r) => r.projectId === projectId);
  const windows = db.windows.filter((w) => w.projectId === projectId);
  const showMoney = role === 'admin' || role === 'sales';
  const fieldWorker = db.profiles.find((p) => p.id === project.fieldWorkerId);
  const tailor = db.profiles.find((p) => p.id === project.tailorId);

  return (
    <>
      <Row gap={spacing.md}>
        <View style={[styles.metric, { backgroundColor: palette.sageSoft }]}>
          <AppText variant="numberLarge">{windows.length}</AppText>
          <AppText variant="caption" color={palette.muted}>
            شباك في {rooms.length} غرفة
          </AppText>
        </View>
        {showMoney && (
          <View style={[styles.metric, { backgroundColor: palette.terracottaSoft }]}>
            <AppText variant="numberLarge">{money(finance.dueAgorot)}</AppText>
            <AppText variant="caption" color={palette.muted}>
              متبقٍ من {money(finance.totalAgorot)}
            </AppText>
          </View>
        )}
      </Row>

      <Card>
        <SectionHeader title="تقدّم المشروع" subtitle="المرحلة الحالية وما قبلها وما بعدها" />
        <View style={{ gap: 2 }}>
          {PROJECT_STATUS_ORDER.map((s, i) => {
            const currentIndex = PROJECT_STATUS_ORDER.indexOf(project.status);
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <View key={s} style={{ opacity: done || active ? 1 : 0.45 }}>
                <Row gap={spacing.md} align="flex-start">
                  <View style={{ alignItems: 'center', width: 20 }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: active ? statusColor : done ? palette.sage : palette.sandDeep,
                      }}
                    />
                    {i < PROJECT_STATUS_ORDER.length - 1 && (
                      <View
                        style={{
                          width: 2,
                          height: 26,
                          backgroundColor: done ? palette.sage : palette.line,
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.sm }}>
                    <AppText
                      variant={active ? 'label' : 'caption'}
                      color={active ? palette.charcoal : palette.muted}
                      style={active ? { fontFamily: font.bold } : undefined}
                    >
                      {PROJECT_STATUS_LABELS[s]}
                    </AppText>
                    {active && (
                      <AppText variant="caption" color={palette.muted}>
                        {PROJECT_STATUS_HINTS[s]}
                      </AppText>
                    )}
                  </View>
                </Row>
              </View>
            );
          })}
        </View>

        {role === 'admin' && (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {!!nextStatus && (
              <AdvanceButton
                label={PROJECT_STATUS_LABELS[nextStatus]}
                onPress={() => setPending({ to: nextStatus, back: false })}
              />
            )}
            {!!prevStatus && (
              <Pressable onPress={() => setPending({ to: prevStatus, back: true })} style={styles.backStep}>
                <AppText variant="caption" color={palette.muted} align="center">
                  رجوع إلى: {PROJECT_STATUS_LABELS[prevStatus]}
                </AppText>
              </Pressable>
            )}
          </View>
        )}
      </Card>

      <ConfirmSheet
        visible={!!pending}
        icon={
          pending?.back ? (
            <ChevronRight size={24} color={palette.muted} />
          ) : (
            <ChevronLeft size={24} color={palette.olive} />
          )
        }
        title={pending?.back ? 'رجوع بالمشروع خطوة' : 'نقل المشروع للمرحلة التالية'}
        body={
          pending
            ? `سيصبح المشروع في مرحلة "${PROJECT_STATUS_LABELS[pending.to]}"، ويظهر بها لكل الفريق.`
            : undefined
        }
        confirmLabel={pending?.back ? 'تأكيد الرجوع' : 'نعم، انقل المشروع'}
        onConfirm={() => {
          if (pending) setProjectStatus(projectId, pending.to);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />

      <Card>
        <AppText variant="heading">الفريق والمواعيد</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <InfoRow label="العامل الميداني" value={fieldWorker?.fullName ?? 'غير معيّن'} />
          <InfoRow label="الخياط" value={tailor?.fullName ?? 'غير معيّن'} />
          <InfoRow label="موعد القياس" value={formatDate(project.measurementDate)} />
          <InfoRow label="موعد التركيب" value={formatDate(project.installationDate)} />
          <InfoRow label="ملاحظات" value={project.notes || '-'} />
        </View>
      </Card>

      {can(role, 'create_quotation') && (
        <Button
          label="فتح عرض السعر"
          full
          variant="secondary"
          icon={<FileText size={18} color={palette.oliveDark} />}
          onPress={() => {
            const q = db.quotations.find((x) => x.projectId === projectId);
            if (q) router.push(`/quotation/${q.id}`);
          }}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" align="flex-start" gap={spacing.lg}>
      <AppText variant="caption" color={palette.muted}>
        {label}
      </AppText>
      <AppText variant="label" style={{ flex: 1 }} align="left">
        {value}
      </AppText>
    </Row>
  );
}

/* ───────────────────────── Rooms ───────────────────────── */

/**
 * توهّج الترحيب بالبطاقة الجديدة.
 *
 * الغرفة تُضاف من نموذج أعلى الصفحة فتظهر بطاقتها تحت ما هو معروض أحيانًا،
 * فيتساءل المستخدم هل حُفظت. حلقةٌ تلمع ثم تنطفئ تجيب عن السؤال دون كلمة،
 * وهي فوق البطاقة لا حولها فلا تزحزح شيئًا من التخطيط.
 */
function NewCardGlow({ active }: { active: boolean }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    glow.value = 1;
    glow.value = withDelay(320, withTiming(0, { duration: 1500, easing: REasing.out(REasing.quad) }));
  }, [active, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  if (!active) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.newGlow, style]}>
      <View style={styles.newGlowWash} />
    </Animated.View>
  );
}

function RoomsTab({
  projectId,
  onFocusCard,
}: {
  projectId: string;
  onFocusCard: (y: number) => void;
}) {
  const { db, role, addRoom, deleteRoom, createQuotation } = useStore();
  const router = useRouter();
  const [newRoom, setNewRoom] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const rooms = db.rooms.filter((r) => r.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  const editable = can(role, 'enter_measurements');
  const windows = db.windows.filter((w) => w.projectId === projectId);
  const quotation = db.quotations.find((q) => q.projectId === projectId);

  return (
    <>
      {editable && (
        <Card>
          <AppText variant="heading">إضافة غرفة</AppText>
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field label="اسم الغرفة" value={newRoom} onChangeText={setNewRoom} placeholder="الصالون" />
            {/* أسماء الغرف تتكرر في كل بيت تقريبًا - لمسة واحدة بدل الكتابة،
                وما يُضاف منها للمشروع يختفي من الاقتراحات فلا يُكرَّر */}
            <Row gap={spacing.sm} wrap>
              {ROOM_SUGGESTIONS.filter(
                (s) => !db.rooms.some((r) => r.projectId === projectId && r.name === s),
              ).map((s) => (
                <Pressable key={s} onPress={() => setNewRoom(s)} style={styles.suggestChip}>
                  <AppText variant="caption" color={palette.oliveDark}>
                    {s}
                  </AppText>
                </Pressable>
              ))}
            </Row>
            <Button
              label="إضافة"
              icon={<Plus size={16} color={palette.ivory} />}
              onPress={() => {
                const res = addRoom(projectId, newRoom, '');
                if (!res.ok) return setError(res.error);
                setNewRoom('');
                setError(null);
                setJustAdded(res.data);
              }}
            />
            {!!error && <Banner tone="danger" title={error} />}
          </View>
        </Card>
      )}

      {rooms.length === 0 && (
        <EmptyState
          icon={<Layers size={26} color={palette.olive} />}
          title="لا توجد غرف بعد"
          body="ابدأ بإضافة غرفة ثم سجّل شبابيكها ومقاساتها."
        />
      )}

      {rooms.map((room) => {
        const roomWindows = db.windows.filter((w) => w.roomId === room.id);
        const totalRunning = roomWindows.reduce((s, w) => s + (w.widthCm / 100) * w.quantity, 0);
        const fresh = justAdded === room.id;
        return (
          <Card
            key={room.id}
            onLayout={
              fresh
                ? (e) => onFocusCard(e.nativeEvent.layout.y)
                : undefined
            }
          >
            <NewCardGlow active={fresh} />
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{room.name}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {roomWindows.length} شباك • {meters(round3(totalRunning), false)} متر طولي
                </AppText>
              </View>
              {editable && (
                <Pressable
                  onPress={() =>
                    Alert.alert('حذف الغرفة', 'سيتم حذف كل شبابيك هذه الغرفة.', [
                      { text: 'إلغاء', style: 'cancel' },
                      { text: 'حذف', style: 'destructive', onPress: () => deleteRoom(room.id) },
                    ])
                  }
                  hitSlop={12}
                >
                  <Trash2 size={18} color={palette.danger} />
                </Pressable>
              )}
            </Row>

            <Divider />

            <View style={{ gap: spacing.sm }}>
              {roomWindows.map((w) => {
                const variant = db.fabricVariants.find((v) => v.id === w.fabricVariantId);
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => router.push(`/window/${w.id}`)}
                    style={({ pressed }) => [styles.windowRow, pressed && { backgroundColor: palette.ivoryDeep }]}
                  >
                    <Row gap={spacing.md}>
                      <Swatch color={variant?.colorHex ?? palette.sand} size={38} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{w.name}</AppText>
                        <AppText variant="caption" color={palette.muted}>
                          {cm(w.widthCm)} × {cm(w.heightCm)} • {CURTAIN_MODEL_LABELS[w.model]} •{' '}
                          {w.hasLining ? 'مع بطانة' : 'بدون بطانة'}
                        </AppText>
                      </View>
                      <ChevronLeft size={16} color={palette.muted} />
                    </Row>
                  </Pressable>
                );
              })}
              {roomWindows.length === 0 && (
                <AppText variant="caption" color={palette.muted}>
                  لا توجد شبابيك في هذه الغرفة بعد.
                </AppText>
              )}
            </View>

            {editable && (
              <Button
                label="إضافة شباك"
                variant="ghost"
                full
                small
                icon={<Plus size={15} color={palette.olive} />}
                style={{ marginTop: spacing.md }}
                onPress={() =>
                  router.push({ pathname: '/window/new', params: { projectId, roomId: room.id } })
                }
              />
            )}
          </Card>
        );
      })}

      {/* أول شباك يكفي لتسعير المشروع، فالدعوة تظهر هنا لا في تبويب آخر
          يتطلب البحث عنه - وهي تفتح العرض نفسه مباشرة لا التبويب. */}
      {windows.length > 0 && can(role, 'create_quotation') && (
        <AdvanceButton
          caption={quotation ? 'العرض جاهز' : 'القياسات كافية'}
          label={quotation ? 'فتح عرض السعر' : 'إنشاء عرض السعر'}
          onPress={() => {
            if (quotation) return router.push(`/quotation/${quotation.id}`);
            const res = createQuotation(projectId);
            if (res.ok) router.push(`/quotation/${res.data}`);
            else Alert.alert('تعذر الإنشاء', res.error);
          }}
        />
      )}
    </>
  );
}

/* ───────────────────────── Quotation ───────────────────────── */

function QuoteTab({
  projectId,
  onGoToProduction,
}: {
  projectId: string;
  onGoToProduction: () => void;
}) {
  const { db, role, createQuotation } = useStore();
  const router = useRouter();
  const quotation = db.quotations.find((q) => q.projectId === projectId);
  const version = currentVersion(db, projectId);
  const windows = db.windows.filter((w) => w.projectId === projectId);
  const showCost = role === 'admin';

  if (!quotation || !version) {
    return (
      <>
        <EmptyState
          icon={<FileText size={26} color={palette.olive} />}
          title="لا يوجد عرض سعر"
          body={
            windows.length === 0
              ? 'سجّل القياسات أولًا، ثم أنشئ العرض بضغطة واحدة.'
              : 'التسعير جاهز - أنشئ العرض من القياسات المسجلة.'
          }
          action={
            can(role, 'create_quotation') && windows.length > 0 ? (
              <Button
                label="إنشاء عرض سعر"
                icon={<Sparkles size={16} color={palette.ivory} />}
                onPress={() => {
                  const res = createQuotation(projectId);
                  if (res.ok) router.push(`/quotation/${res.data}`);
                  else Alert.alert('تعذر الإنشاء', res.error);
                }}
              />
            ) : undefined
          }
        />
      </>
    );
  }

  return (
    <>
      {/* القرار حيث العرض: من هنا كان المستخدم يرى النسخة بلا أزرار فيظنّها
          عرضًا آخر غير الذي رآه من اللوحة. المكوّن واحد في الموضعين. */}
      {can(role, 'create_quotation') && version.status === 'sent' && (
        <QuotationDecision
          versionId={version.id}
          projectId={projectId}
          onApproved={onGoToProduction}
          onEdit={() => router.push(`/quotation/${quotation.id}`)}
        />
      )}

      <Card onPress={() => router.push(`/quotation/${quotation.id}`)}>
        <Row justify="space-between">
          <View>
            <AppText variant="heading">{quotation.number}</AppText>
            <AppText variant="caption" color={palette.muted}>
              النسخة {version.versionNumber} • {formatDate(version.createdAt)}
            </AppText>
          </View>
          <AppText variant="numberLarge">{money(version.totalAgorot)}</AppText>
        </Row>
        <Divider />
        <Row justify="space-between">
          <AppText variant="caption" color={palette.muted}>
            {version.items.length} بند • خصم {percent(version.discountPercent)}
          </AppText>
          {showCost && (
            <AppText variant="caption" color={palette.olive}>
              هامش {percent(version.marginPercent)}
            </AppText>
          )}
        </Row>
      </Card>

      {version.items.map((item) => (
        <Card key={item.id}>
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1 }}>
              <AppText variant="label">
                {item.roomName} - {item.windowName}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {item.description}
              </AppText>
              <AppText variant="caption" color={palette.muted}>
                {cm(item.widthCm)} × {cm(item.heightCm)} • {meters(item.runningMeters, false)} متر طولي
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <AppText variant="number">{money(item.lineTotalAgorot)}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {money(item.unitPriceAgorot)}/م
              </AppText>
            </View>
          </Row>
          {showCost && (
            <Row justify="space-between" style={{ marginTop: spacing.sm }}>
              <Pill
                label={`تكلفة ${money(item.internalCostAgorot)}`}
                bg={palette.ivoryDeep}
                fg={palette.muted}
                small
              />
              <Pill
                label={`ربح ${money(item.lineTotalAgorot - item.internalCostAgorot)}`}
                bg={palette.successSoft}
                fg={palette.success}
                small
              />
            </Row>
          )}
        </Card>
      ))}

      <Button
        label="فتح عرض السعر الكامل"
        full
        icon={<FileText size={18} color={palette.ivory} />}
        onPress={() => router.push(`/quotation/${quotation.id}`)}
      />
    </>
  );
}

/* ───────────────────────── Production ───────────────────────── */

function ProductionTab({ projectId }: { projectId: string }) {
  const { db, role, busy, autoReserveForProject } = useStore();
  const router = useRouter();
  const gaps = projectFabricGaps(db, projectId);
  const reservations = db.reservations.filter((r) => r.projectId === projectId);
  const assignment = db.tailorAssignments.find((a) => a.projectId === projectId);
  const usages = db.usages.filter((u) => u.projectId === projectId);

  // ناقص = لا يكفي مخزونه فلم يُحجز منه شيء؛ متاح = يمكن حجزه الآن
  const short = gaps.filter((g) => g.remaining > 0 && g.available < g.remaining);
  const ready = gaps.filter((g) => g.remaining > 0 && g.available >= g.remaining);

  return (
    <>
      <Card>
        <SectionHeader
          title="خطة القماش"
          subtitle="تُحجز تلقائيًا عند اعتماد العرض حسب اختيار كل شباك"
        />
        {gaps.map((g) => {
          const variant = db.fabricVariants.find((v) => v.id === g.variantId);
          const done = g.remaining === 0;
          const blocked = g.remaining > 0 && g.available < g.remaining;
          return (
            <View key={g.variantId} style={{ gap: 6, marginBottom: spacing.md }}>
              <Row justify="space-between">
                <Row gap={spacing.sm}>
                  <Swatch color={variant?.colorHex ?? palette.sand} size={22} />
                  <AppText variant="label">{g.label}</AppText>
                </Row>
                <AppText
                  variant="caption"
                  color={done ? palette.success : blocked ? palette.danger : palette.terracotta}
                >
                  {meters(g.reserved)} / {meters(g.required)}
                </AppText>
              </Row>
              <ProgressBar
                value={g.required > 0 ? g.reserved / g.required : 0}
                color={done ? palette.success : blocked ? palette.danger : palette.terracotta}
              />
              {blocked && (
                <AppText variant="caption" color={palette.danger}>
                  ينقص {meters(round3(g.remaining - g.available))} - المتاح في المخزون{' '}
                  {meters(g.available)} فقط
                </AppText>
              )}
            </View>
          );
        })}
        {gaps.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا توجد أقمشة محددة على الشبابيك بعد.
          </AppText>
        )}

        {short.length > 0 && (
          <Banner
            tone="danger"
            title="المخزون لا يكفي - لم يُحجز شيء من هذه الأقمشة"
            body="الحجز الجزئي يقضم المتاح دون أن يُطلق الإنتاج، فيُترك الصنف كما هو حتى تزيد الكمية. زد المخزون ثم اضغط «احجز الآن»."
            icon={<AlertTriangle size={16} color={palette.danger} />}
          />
        )}

        {can(role, 'reserve_fabric') && ready.length > 0 && (
          <Button
            label="احجز الآن"
            full
            loading={busy === 'reserve'}
            icon={<Layers size={16} color={palette.ivory} />}
            style={{ marginTop: spacing.md }}
            onPress={() => autoReserveForProject(projectId)}
          />
        )}
        {can(role, 'reserve_fabric') && gaps.some((g) => g.remaining > 0) && (
          <Button
            label="حجز يدوي من رول معيّن"
            variant="ghost"
            small
            full
            style={{ marginTop: spacing.sm }}
            onPress={() => router.push(`/reserve/${projectId}`)}
          />
        )}
      </Card>

      <Card>
        <SectionHeader title="الحجوزات" subtitle="مرتبطة بسجل حركة المخزون" />
        {reservations.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا توجد حجوزات بعد.
          </AppText>
        )}
        {reservations.map((r) => {
          const roll = db.fabricRolls.find((x) => x.id === r.rollId);
          const variant = db.fabricVariants.find((v) => v.id === roll?.variantId);
          return (
            <Pressable key={r.id} onPress={() => router.push(`/roll/${r.rollId}`)}>
              <Row justify="space-between" style={{ paddingVertical: spacing.sm }}>
                <Row gap={spacing.md}>
                  <Swatch color={variant?.colorHex ?? palette.sand} size={30} />
                  <View>
                    <AppText variant="label">{roll?.code}</AppText>
                    <AppText variant="caption" color={palette.muted}>
                      محجوز {meters(r.quantityM)} • مستهلك {meters(r.consumedM)}
                    </AppText>
                  </View>
                </Row>
                <Pill
                  label={
                    r.status === 'active'
                      ? 'نشط'
                      : r.status === 'consumed'
                        ? 'مستهلك'
                        : r.status === 'released'
                          ? 'مفكوك'
                          : 'استهلاك جزئي'
                  }
                  bg={r.status === 'released' ? palette.sand : palette.sageSoft}
                  fg={r.status === 'released' ? palette.muted : palette.oliveDark}
                  small
                />
              </Row>
            </Pressable>
          );
        })}
      </Card>

      {assignment && (
        <Card onPress={() => router.push(`/tailor/${assignment.id}`)}>
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <AppText variant="heading">أمر الإنتاج</AppText>
              <AppText variant="caption" color={palette.muted}>
                {db.profiles.find((p) => p.id === assignment.tailorId)?.fullName} • تسليم{' '}
                {formatDate(assignment.dueDate)}
              </AppText>
            </View>
            <Pill
              label={TAILOR_STAGE_LABELS[assignment.stage]}
              bg={palette.terracottaSoft}
              fg={palette.terracotta}
            />
          </Row>
          <Row gap={spacing.sm} style={{ marginTop: spacing.md }}>
            <Scissors size={16} color={palette.muted} />
            <AppText variant="caption" color={palette.muted}>
              {assignment.instructions}
            </AppText>
          </Row>
        </Card>
      )}

      {usages.length > 0 && (
        <Card>
          <SectionHeader title="سجل الاستهلاك" />
          {usages.map((u) => (
            <Row key={u.id} justify="space-between" style={{ paddingVertical: 6 }}>
              <AppText variant="caption" color={palette.muted}>
                {formatDate(u.createdAt)}
              </AppText>
              <AppText variant="label">
                {meters(u.actualM)} {u.wasteM > 0 ? `(هدر ${meters(u.wasteM)})` : ''}
              </AppText>
            </Row>
          ))}
        </Card>
      )}
    </>
  );
}

/* ───────────────────────── Money ───────────────────────── */

function MoneyTab({ projectId }: { projectId: string }) {
  const { db, role, recordPayment, reversePayment, busy } = useStore();
  const finance = projectFinance(db, projectId);
  const payments = db.payments.filter((p) => p.projectId === projectId);
  const hasApprovedQuote = useMemo(
    () =>
      db.quotationVersions.some(
        (v) =>
          v.status === 'approved' &&
          db.quotations.some((q) => q.id === v.quotationId && q.projectId === projectId),
      ),
    [db.quotationVersions, db.quotations, projectId],
  );
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<'cash' | 'check'>('cash');
  const [checksOpen, setChecksOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    const value = Math.round(parseFloat(amount || '0') * 100);
    const res = await recordPayment({
      projectId,
      amountAgorot: value,
      kind: finance.paidAgorot === 0 ? 'deposit' : finance.dueAgorot - value <= 0 ? 'final' : 'milestone',
      method,
      reference: '',
      note: '',
    });
    if (!res.ok) return setError(res.error);
    setAmount('');
    setSuccess('تم تسجيل الدفعة بنجاح.');
  };

  return (
    <>
      <Card>
        <Row justify="space-between">
          <View>
            <AppText variant="caption" color={palette.muted}>
              إجمالي العرض المعتمد
            </AppText>
            <AppText variant="numberLarge">{money(finance.totalAgorot)}</AppText>
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <AppText variant="caption" color={palette.muted}>
              المتبقي
            </AppText>
            <AppText variant="numberLarge" color={palette.terracotta}>
              {money(finance.dueAgorot)}
            </AppText>
          </View>
        </Row>
        <View style={{ marginTop: spacing.md, gap: 6 }}>
          <ProgressBar value={finance.paidRatio} color={palette.success} />
          <AppText variant="caption" color={palette.muted}>
            حُصّل {money(finance.paidAgorot)} من {money(finance.totalAgorot)}
          </AppText>
        </View>
      </Card>

      {can(role, 'record_payment') &&
        (hasApprovedQuote ? (
          <Card>
            <AppText variant="heading">تسجيل دفعة</AppText>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {/* M6: طريقة الدفع اختيار صريح - نقدًا أو شيك */}
              <SegmentedControl
                value={method}
                onChange={(m) => setMethod(m)}
                options={[
                  { value: 'cash', label: 'نقدًا' },
                  { value: 'check', label: 'شيك' },
                ]}
              />
              <Field
                label="المبلغ"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                suffix="₪"
                placeholder="0"
              />
              <Button
                label={method === 'check' ? 'تسجيل شيك واحد' : 'تسجيل الدفعة'}
                full
                loading={busy === 'payment'}
                icon={<Banknote size={18} color={palette.ivory} />}
                onPress={submit}
              />
              {method === 'check' && (
                <Button
                  label={checksOpen ? 'إخفاء رزمة الشيكات' : 'رزمة شيكات متعددة...'}
                  variant="secondary"
                  small
                  full
                  onPress={() => setChecksOpen((s) => !s)}
                />
              )}
              {method === 'check' && checksOpen && (
                <CheckWizard
                  projectId={projectId}
                  onDone={() => {
                    setChecksOpen(false);
                    setSuccess('سُجّلت رزمة الشيكات بمواعيد صرفها.');
                  }}
                />
              )}
              {!!error && <Banner tone="danger" title="تعذر تسجيل الدفعة" body={error} />}
              {!!success && <Banner tone="success" title={success} />}
            </View>
          </Card>
        ) : (
          /* لا نموذج دفع أصلًا قبل الاعتماد: منع الفعل خيرٌ من رفضه بعد كتابته */
          <Banner
            tone="info"
            title="التحصيل يبدأ بعد اعتماد العرض"
            body="لا يمكن تسجيل دفعة قبل موافقة الزبون على عرض السعر، إذ لا يوجد مبلغ متفق عليه تُحسب عليه الدفعة والمتبقي."
            icon={<Wallet size={16} color={palette.info} />}
          />
        ))}

      <Card>
        <SectionHeader title="سجل الدفعات" />
        {payments.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا توجد دفعات بعد.
          </AppText>
        )}
        {payments.map((p) => (
          <Row key={p.id} justify="space-between" style={{ paddingVertical: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Row gap={spacing.sm}>
                <AppText variant="label">{money(p.amountAgorot)}</AppText>
                {p.method === 'check' && (
                  <Pill
                    label={p.reference || 'شيك'}
                    bg={palette.infoSoft}
                    fg={palette.info}
                    small
                  />
                )}
              </Row>
              <AppText variant="caption" color={palette.muted}>
                {p.method === 'check' && p.dueAt
                  ? `يُصرف ${formatDate(p.dueAt)} • `
                  : `${formatDate(p.createdAt)} • `}
                {p.note || 'بدون ملاحظة'}
              </AppText>
            </View>
            {p.kind !== 'reversal' && role === 'admin' && (
              <Button
                label="عكس"
                variant="ghost"
                small
                onPress={() =>
                  Alert.alert('عكس الدفعة', 'سيتم إنشاء قيد عكسي دائم في السجل.', [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'تأكيد', onPress: () => reversePayment(p.id, 'تصحيح إداري') },
                  ])
                }
              />
            )}
          </Row>
        ))}
      </Card>
    </>
  );
}

/* ───────────────────────── Media ───────────────────────── */

function MediaTab({ projectId }: { projectId: string }) {
  const { db } = useStore();
  const attachments = db.attachments.filter((a) => a.projectId === projectId);

  if (attachments.length === 0) {
    return (
      <EmptyState
        icon={<Camera size={26} color={palette.olive} />}
        title="لا توجد صور"
        body="تُلتقط الصور أثناء زيارة القياس أو التركيب وتُرفع تلقائيًا عند توفر الشبكة."
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {attachments.map((a) => (
        <Card key={a.id} padded={false} style={{ overflow: 'hidden' }}>
          <Image
            source={{ uri: a.uri }}
            style={{ width: '100%', height: 200, backgroundColor: palette.sand }}
            contentFit="cover"
            transition={200}
          />
          <View style={{ padding: spacing.md }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <AppText variant="label">{a.caption || ATTACHMENT_KIND_LABELS[a.kind]}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {formatDate(a.createdAt)} •{' '}
                  {db.profiles.find((p) => p.id === a.createdBy)?.fullName ?? ''}
                </AppText>
              </View>
              <Pill
                label={a.uploaded ? 'مرفوعة' : 'بانتظار الرفع'}
                bg={a.uploaded ? palette.successSoft : palette.warningSoft}
                fg={a.uploaded ? palette.success : palette.warning}
                small
              />
            </Row>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** حلقة ترحيب فوق البطاقة الجديدة - لا تزحزح التخطيط لأنها طبقة مطلقة. */
  newGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: palette.olive,
    overflow: 'hidden',
  },
  newGlowWash: { flex: 1, backgroundColor: palette.olive, opacity: 0.07 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  /** خطٌّ واحد يسافر بين التبويبات - موضعه وعرضه محرّكان لا حالتان. */
  tabIndicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.terracotta,
  },
  metric: { flex: 1, borderRadius: radius.lg, padding: spacing.lg },
  advanceBtn: {
    minHeight: 68,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  advanceArrows: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  backStep: { paddingVertical: spacing.sm },
  suggestChip: {
    paddingHorizontal: spacing.md,
    height: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.sand,
  },
  windowRow: {
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
});
