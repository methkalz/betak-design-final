import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing as REasing,
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
  Swatch,
} from '@/components/ui';
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
import { currentVersion, projectFabricPlan, projectFinance, useProject } from '@/hooks/selectors';
import { cm, formatDate, meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { ProjectStatus } from '@/types/domain';

type Tab = 'overview' | 'rooms' | 'quote' | 'production' | 'money' | 'media';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'نظرة عامة' },
  { value: 'rooms', label: 'الغرف والشبابيك' },
  { value: 'quote', label: 'عرض السعر' },
  { value: 'production', label: 'القماش والإنتاج' },
  { value: 'money', label: 'الدفعات' },
  { value: 'media', label: 'الصور' },
];

export default function ProjectStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, role } = useStore();
  const project = useProject(id);
  const [tab, setTab] = useState<Tab>('overview');
  const tabsRef = useRef<ScrollView>(null);
  const tabsPinned = useRef(false);

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
  const visibleTabs = TABS.filter((t) => {
    if (role === 'tailor') return ['overview', 'rooms', 'production'].includes(t.value);
    if (role === 'field') return ['overview', 'rooms', 'media'].includes(t.value);
    return true;
  });

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
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
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

      <View style={{ backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.line }}>
        {/* شريط التبويبات عربي (row-reverse) فأول تبويب يقع أقصى يمين
            المحتوى، بينما التمرير الأفقي يبدأ من اليسار دائمًا - فيُفتح
            المشروع على آخر التبويبات. القفز لنهاية المحتوى مرة واحدة عند
            القياس يضع «نظرة عامة» أمام المستخدم كما يجب. */}
        <ScrollView
          ref={tabsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (tabsPinned.current) return;
            tabsPinned.current = true;
            tabsRef.current?.scrollToEnd({ animated: false });
          }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row-reverse' }}
        >
          {visibleTabs.map((t) => (
            <Pressable key={t.value} onPress={() => setTab(t.value)} style={styles.tabBtn}>
              <AppText variant="label" color={tab === t.value ? palette.olive : palette.muted}>
                {t.label}
              </AppText>
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  marginTop: 6,
                  backgroundColor: tab === t.value ? palette.terracotta : 'transparent',
                }}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'overview' && <OverviewTab projectId={project.id} statusColor={c.fg} />}
        {tab === 'rooms' && <RoomsTab projectId={project.id} />}
        {tab === 'quote' && <QuoteTab projectId={project.id} />}
        {tab === 'production' && <ProductionTab projectId={project.id} />}
        {tab === 'money' && <MoneyTab projectId={project.id} />}
        {tab === 'media' && <MediaTab projectId={project.id} />}
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

/**
 * زر التقدّم — الممارسة المعتمدة (2024-2026): إجراء أساسي بارز وواضح
 * الوجهة، لا نقر على عنصر صغير داخل قائمة. السهم يتحرك بلطف لا زخرفةً بل
 * ليقول «اضغط هنا للانتقال»، وهي إشارة الإمكانية (affordance) التي كانت
 * غائبة حين كان النقل مخبوءًا في نقطة ملوّنة.
 */
function AdvanceButton({ label, onPress }: { label: string; onPress: () => void }) {
  // سهمان يتتابعان لا قرص يتحرك: الحركة يجب أن تكون في الرمز الدال على
  // الاتجاه نفسه. التأخير بين السهمين يصنع إحساس التدفق نحو الأمام.
  const x1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  useEffect(() => {
    const cycle = { duration: 620, easing: REasing.inOut(REasing.quad) };
    x1.value = withRepeat(withTiming(-9, cycle), -1, true);
    x2.value = withDelay(140, withRepeat(withTiming(-9, cycle), -1, true));
  }, [x1, x2]);
  const nudge1 = useAnimatedStyle(() => ({ transform: [{ translateX: x1.value }] }));
  const nudge2 = useAnimatedStyle(() => ({ transform: [{ translateX: x2.value }] }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.advanceBtn, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient
        colors={gradients.indigo as unknown as [string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Row justify="space-between" style={{ flex: 1 }}>
        <View>
          <AppText variant="caption" color="rgba(255,255,255,0.75)">
            المرحلة التالية
          </AppText>
          <AppText variant="heading" color={palette.white}>
            {label}
          </AppText>
        </View>
        <View style={styles.advanceArrows}>
          <Animated.View style={nudge1}>
            <ChevronLeft size={28} color={palette.white} />
          </Animated.View>
          <Animated.View style={[nudge2, { marginRight: -16 }]}>
            <ChevronLeft size={28} color="rgba(255,255,255,0.55)" />
          </Animated.View>
        </View>
      </Row>
    </Pressable>
  );
}

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

function RoomsTab({ projectId }: { projectId: string }) {
  const { db, role, addRoom, deleteRoom } = useStore();
  const router = useRouter();
  const [newRoom, setNewRoom] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const rooms = db.rooms.filter((r) => r.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  const editable = can(role, 'enter_measurements');

  return (
    <>
      {editable && (
        <Card>
          <AppText variant="heading">إضافة غرفة</AppText>
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field label="اسم الغرفة" value={newRoom} onChangeText={setNewRoom} placeholder="صالون الضيوف" />
            <Button
              label="إضافة"
              icon={<Plus size={16} color={palette.ivory} />}
              onPress={() => {
                const res = addRoom(projectId, newRoom, '');
                if (!res.ok) return setError(res.error);
                setNewRoom('');
                setError(null);
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
        const windows = db.windows.filter((w) => w.roomId === room.id);
        const totalRunning = windows.reduce((s, w) => s + (w.widthCm / 100) * w.quantity, 0);
        return (
          <Card key={room.id}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{room.name}</AppText>
                <AppText variant="caption" color={palette.muted}>
                  {windows.length} شباك • {meters(round3(totalRunning))} متر طولي
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
              {windows.map((w) => {
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
              {windows.length === 0 && (
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
    </>
  );
}

/* ───────────────────────── Quotation ───────────────────────── */

function QuoteTab({ projectId }: { projectId: string }) {
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
                {cm(item.widthCm)} × {cm(item.heightCm)} • {meters(item.runningMeters)} متر طولي
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
  const { db, role } = useStore();
  const router = useRouter();
  const plan = projectFabricPlan(db, projectId);
  const reservations = db.reservations.filter((r) => r.projectId === projectId);
  const assignment = db.tailorAssignments.find((a) => a.projectId === projectId);
  const usages = db.usages.filter((u) => u.projectId === projectId);

  return (
    <>
      <Card>
        <SectionHeader title="خطة القماش" subtitle="محسوبة من القياسات والمضاعف" />
        {plan.map((p) => {
          const reserved = reservations
            .filter((r) => {
              const roll = db.fabricRolls.find((x) => x.id === r.rollId);
              return roll?.variantId === p.variantId && r.status !== 'released';
            })
            .reduce((s, r) => s + r.quantityM, 0);
          const variant = db.fabricVariants.find((v) => v.id === p.variantId);
          const ok = reserved >= p.meters;
          return (
            <View key={p.variantId} style={{ gap: 6, marginBottom: spacing.md }}>
              <Row justify="space-between">
                <Row gap={spacing.sm}>
                  <Swatch color={variant?.colorHex ?? palette.sand} size={22} />
                  <AppText variant="label">{p.label}</AppText>
                </Row>
                <AppText variant="caption" color={ok ? palette.success : palette.terracotta}>
                  {meters(reserved)} / {meters(p.meters)}
                </AppText>
              </Row>
              <ProgressBar
                value={p.meters > 0 ? reserved / p.meters : 0}
                color={ok ? palette.success : palette.terracotta}
              />
            </View>
          );
        })}
        {plan.length === 0 && (
          <AppText variant="caption" color={palette.muted}>
            لا توجد أقمشة محددة على الشبابيك بعد.
          </AppText>
        )}
        {can(role, 'reserve_fabric') && (
          <Button
            label="حجز قماش من المخزون"
            full
            variant="secondary"
            icon={<Layers size={16} color={palette.oliveDark} />}
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
  const [amount, setAmount] = useState<string>('');
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
      method: 'cash',
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

      {can(role, 'record_payment') && (
        <Card>
          <AppText variant="heading">تسجيل دفعة</AppText>
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Field
              label="المبلغ"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              suffix="₪"
              placeholder="0"
            />
            <Button
              label="تسجيل الدفعة"
              full
              loading={busy === 'payment'}
              icon={<Banknote size={18} color={palette.ivory} />}
              onPress={submit}
            />
            {!!error && <Banner tone="danger" title="تعذر تسجيل الدفعة" body={error} />}
            {!!success && <Banner tone="success" title={success} />}
          </View>
        </Card>
      )}

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
              <AppText variant="label">{money(p.amountAgorot)}</AppText>
              <AppText variant="caption" color={palette.muted}>
                {formatDate(p.createdAt)} • {p.note || 'بدون ملاحظة'}
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
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, minHeight: 48 },
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
  windowRow: {
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
});
