/**
 * ما يظهر خلف أرقام اللوحة حين تُضغط.
 *
 * الرقم على اللوحة يقول «كم»، وهذه الأوراق تقول «أيّها ولماذا». والقاعدة
 * الحاكمة: لا صفَّ إلا ويُغيّر قرارًا - أيُّ مشروعٍ واقف، أيُّ قماشٍ محجوزٌ
 * منذ شهر، أيُّ صنفٍ ينتظره زبونٌ الآن. وما لا يُحسب من بياناتٍ موجودة لا
 * يُعرض تخمينًا.
 *
 * وفخاخ الصدق مسمّاة في مواضعها: الملحق يُعدّ مستندًا في الصفوف ويُجمع على
 * جذره في المال، والنسبة لا تُعرض بلا مقام، والنطاق (شهرٌ أم كل الوقت)
 * يُقال صراحةً لا يُسقَط صمتًا.
 */
import { useRouter } from 'expo-router';
import { BarChart3, Layers, LayoutGrid, Package, TrendingUp } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Banner, Divider, EmptyState, Pill, Row, Sheet, Swatch } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { projectFamilyFinance } from '@/domain/annex';
import { assignmentGaps } from '@/domain/assignment';
import { projectFabricGaps } from '@/domain/fabricPlan';
import { availabilityTone, LOW_STOCK_THRESHOLD_M } from '@/domain/inventory';
import { PROJECT_STATUS_HINTS, PROJECT_STATUS_LABELS, projectStatusColor } from '@/domain/labels';
import { monthlyConsumption } from '@/domain/reports';
import type { Database } from '@/data/seed';
import type { VariantStockView } from '@/hooks/selectors';
import { meters, money, percent } from '@/lib/format';
import { useStore } from '@/providers/store';
import type { QuotationVersion } from '@/types/domain';

const DAY = 86400000;
const MAX_ROWS = 6;

const days = (iso: string | null | undefined): number =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : 0;

/** رمادي ثم تحذير ثم خطر - الانتظار يُقرأ لونًا قبل أن يُقرأ رقمًا. */
const waitTone = (n: number, warn: number, danger: number): string =>
  n >= danger ? palette.danger : n >= warn ? palette.warning : palette.muted;

/**
 * صفُّ الورقة الواحد: هوية على اليمين، رقم على اليسار، وسطرُ سببٍ بينهما.
 * واحدٌ لكل الأوراق الخمس - فالعين تتعلّم القراءة مرة.
 */
function SheetRow({
  title,
  subtitle,
  note,
  noteColor,
  value,
  valueColor,
  pill,
  pillTone,
  swatch,
  onPress,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  noteColor?: string;
  value?: string;
  valueColor?: string;
  pill?: string;
  pillTone?: { bg: string; fg: string };
  swatch?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <Row justify="space-between" gap={spacing.md} style={{ paddingVertical: spacing.sm }}>
      <Row gap={spacing.sm} style={{ flex: 1 }}>
        {swatch !== undefined && swatch !== null && <Swatch color={swatch} size={16} />}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" numberOfLines={1}>
            {title}
          </AppText>
          {!!subtitle && (
            <AppText variant="caption" color={palette.muted} numberOfLines={1}>
              {subtitle}
            </AppText>
          )}
          {!!note && (
            <AppText variant="caption" color={noteColor ?? palette.muted} numberOfLines={2}>
              {note}
            </AppText>
          )}
        </View>
      </Row>
      <View style={{ alignItems: 'flex-start', gap: 4 }}>
        {!!value && (
          <AppText variant="label" color={valueColor ?? palette.charcoal}>
            {value}
          </AppText>
        )}
        {!!pill && (
          <Pill
            label={pill}
            bg={pillTone?.bg ?? palette.sand}
            fg={pillTone?.fg ?? palette.oliveDark}
            small
          />
        )}
      </View>
    </Row>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => (pressed ? { opacity: 0.6, borderRadius: radius.sm } : undefined)}
    >
      {body}
    </Pressable>
  );
}

/** ذيلٌ يقول ما لم يُعرض بدل أن يبتلعه السقف صمتًا. */
function Tail({ hidden, label, onPress }: { hidden: number; label: string; onPress: () => void }) {
  if (hidden <= 0) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingTop: spacing.sm }}>
      <AppText variant="caption" color={palette.olive}>
        {`+${hidden} ${label}`}
      </AppText>
    </Pressable>
  );
}

/* ═════════════════════ ١) المشاريع النشطة ═════════════════════ */

export function ActiveProjectsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const router = useRouter();

  const view = useMemo(() => {
    const active = db.projects.filter((p) => p.status !== 'completed');
    const gaps = assignmentGaps(db);

    // المال على الجذور مرةً واحدة: الملحق مستندٌ في الصفوف ودفتره على أصله،
    // فجمعُه على المستندات يضاعف كل عائلة
    const roots = new Set(active.map((p) => p.parentProjectId ?? p.id));
    const dueAgorot = Array.from(roots).reduce(
      (s, id) => s + projectFamilyFinance(db, id).dueAgorot,
      0,
    );
    const annexCount = active.filter((p) => p.parentProjectId).length;

    const rows = active.map((p) => {
      const customer = db.customers.find((c) => c.id === p.customerId);
      const gap = gaps.find((g) => g.projectId === p.id);
      const fabricGaps = projectFabricGaps(db, p.id).filter((g) => g.remaining > 0);
      const lateTailor = db.tailorAssignments.some(
        (t) => t.projectId === p.id && !t.completedAt && t.dueDate && new Date(t.dueDate) < new Date(),
      );

      let note = PROJECT_STATUS_HINTS[p.status] ?? '';
      let noteColor: string = palette.muted;
      let blocked = true;
      let tab: 'overview' | 'production' = 'overview';

      if (gap) {
        note = gap.blocks;
        noteColor = palette.danger;
      } else if (fabricGaps.length > 0) {
        const total = fabricGaps.reduce((s, g) => s + g.remaining, 0);
        const biggest = [...fabricGaps].sort((a, b) => b.remaining - a.remaining)[0];
        note = `ينقصه ${meters(total)} - ${biggest.label}`;
        noteColor = palette.danger;
        tab = 'production';
      } else if (lateTailor) {
        note = 'تأخّر تسليم الخياط';
        noteColor = palette.warning;
        tab = 'production';
      } else if (p.status === 'ready_for_install' && !p.installationDate) {
        note = 'جاهز للتركيب بلا موعد';
        noteColor = palette.warning;
      } else {
        blocked = false;
      }

      return { p, customer, note, noteColor, blocked, tab, waited: days(p.updatedAt) };
    });

    rows.sort((a, b) =>
      a.blocked !== b.blocked ? (a.blocked ? -1 : 1) : b.waited - a.waited,
    );
    return { rows, dueAgorot, annexCount, rootCount: roots.size, total: active.length };
  }, [db]);

  const shown = view.rows.slice(0, MAX_ROWS);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="المشاريع النشطة"
      subtitle={
        view.total === 0
          ? 'لا مشروع مفتوح'
          : `${view.total} مستندًا = ${view.rootCount} مشروعًا + ${view.annexCount} ملحقًا · المتبقي على العائلات ${money(view.dueAgorot)}`
      }
    >
      {view.total === 0 ? (
        <EmptyState icon={<LayoutGrid size={26} color={palette.olive} />} title="لا مشاريع نشطة" body="أول مشروعٍ تفتحه يظهر هنا مع ما يعطّله." />
      ) : (
        <>
          {shown.map((r, i) => (
            <View key={r.p.id}>
              {i > 0 && <Divider />}
              <SheetRow
                title={r.p.code}
                subtitle={r.customer?.fullName ?? ''}
                note={r.note}
                noteColor={r.noteColor}
                value={`${r.waited} يوم`}
                valueColor={waitTone(r.waited, 7, 14)}
                pill={PROJECT_STATUS_LABELS[r.p.status]}
                pillTone={{
                  bg: projectStatusColor(r.p.status).bg,
                  fg: projectStatusColor(r.p.status).fg,
                }}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/project/[id]', params: { id: r.p.id, tab: r.tab } });
                }}
              />
            </View>
          ))}
          <Tail
            hidden={view.total - shown.length}
            label="مشروعًا آخر"
            onPress={() => {
              onClose();
              router.push('/(tabs)/projects');
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/* ═════════════════════ ٢) القماش المحجوز ═════════════════════ */

export function ReservedFabricSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const router = useRouter();

  const view = useMemo(() => {
    // من دفتر الحجوزات نفسه الذي تُحسب منه البلاطة - ورقةٌ تقرأ من دفترٍ
    // آخر تناقض الرقم الذي فُتحت منه
    const open = db.reservations.filter(
      (r) => r.status === 'active' || r.status === 'partially_consumed',
    );
    const remainingOf = (r: (typeof open)[number]) =>
      Math.max(0, r.quantityM - r.consumedM - (r.releasedM ?? 0) - (r.damagedReservedM ?? 0));

    const byProject = new Map<
      string,
      { projectId: string; m: number; oldest: string; variants: Set<string>; atTailor: boolean; partial: boolean }
    >();
    let consigned = 0;

    for (const r of open) {
      const m = remainingOf(r);
      if (m <= 0) continue;
      const roll = db.fabricRolls.find((x) => x.id === r.rollId);
      const atTailor = !!roll?.assignedTailorId;
      if (atTailor) consigned += m;
      const g = byProject.get(r.projectId) ?? {
        projectId: r.projectId,
        m: 0,
        oldest: r.createdAt,
        variants: new Set<string>(),
        atTailor: false,
        partial: false,
      };
      g.m += m;
      if (new Date(r.createdAt) < new Date(g.oldest)) g.oldest = r.createdAt;
      if (roll?.variantId) g.variants.add(roll.variantId);
      g.atTailor = g.atTailor || atTailor;
      g.partial = g.partial || r.status === 'partially_consumed';
      byProject.set(r.projectId, g);
    }

    const rows = Array.from(byProject.values())
      .map((g) => {
        const p = db.projects.find((x) => x.id === g.projectId);
        const customer = db.customers.find((c) => c.id === p?.customerId);
        const variantId = Array.from(g.variants)[0];
        const variant = db.fabricVariants.find((v) => v.id === variantId);
        const product = db.fabricProducts.find((x) => x.id === variant?.productId);
        const extra = g.variants.size - 1;
        return {
          ...g,
          code: p?.code ?? '—',
          customer: customer?.fullName ?? '',
          swatch: variant?.colorHex ?? null,
          fabric: variant
            ? `${product?.name ?? ''} ${variant.colorName}${extra > 0 ? ` +${extra}` : ''}`
            : '',
          waited: days(g.oldest),
        };
      })
      .sort((a, b) => b.waited - a.waited);

    const totalM = rows.reduce((s, r) => s + r.m, 0);

    // نقصٌ يمنع القص: أول مشروعٍ لا يكفيه المتاح
    const short = db.projects
      .filter((p) => p.status !== 'completed')
      .flatMap((p) =>
        projectFabricGaps(db, p.id)
          .filter((g) => g.remaining > g.available)
          .map((g) => ({ code: p.code, label: g.label, missing: g.remaining - g.available, id: p.id })),
      )
      .sort((a, b) => b.missing - a.missing)[0];

    return { rows, totalM, consigned, waiting: totalM - consigned, short };
  }, [db]);

  const shown = view.rows.slice(0, MAX_ROWS);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="القماش المحجوز"
      subtitle="المتبقي = الأصلي − المستهلك − المحرَّر − التالف"
    >
      {view.rows.length === 0 ? (
        <EmptyState icon={<Package size={26} color={palette.olive} />} title="لا حجز مفتوح" body="القماش يُحجز تلقائيًا حين يعتمد الزبون العرض." />
      ) : (
        <>
          {!!view.short && (
            <Banner
              tone="danger"
              title={`${view.short.code} ينقصه ${meters(view.short.missing)}`}
              body={`${view.short.label} - لا يكفي المتاح في المخزن.`}
            />
          )}
          <Row justify="space-between" style={{ paddingVertical: spacing.sm }}>
            <AppText variant="caption" color={palette.muted}>
              {`عند خياطين ${meters(view.consigned)}`}
            </AppText>
            <AppText variant="caption" color={palette.muted}>
              {`بانتظار القص ${meters(view.waiting)}`}
            </AppText>
          </Row>
          <Divider />
          {shown.map((r, i) => (
            <View key={r.projectId}>
              {i > 0 && <Divider />}
              <SheetRow
                swatch={r.swatch}
                title={r.code}
                subtitle={r.customer}
                note={`${meters(r.m)} · ${r.fabric}`}
                value={`${r.waited} يوم`}
                valueColor={waitTone(r.waited, 14, 30)}
                pill={r.atTailor ? 'عند الخياط' : r.partial ? 'قُصّ جزئيًا' : 'بانتظار القص'}
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: '/project/[id]',
                    params: { id: r.projectId, tab: 'production' },
                  });
                }}
              />
            </View>
          ))}
          <Tail
            hidden={view.rows.length - shown.length}
            label="مشروعًا آخر"
            onPress={() => {
              onClose();
              router.push('/(tabs)/inventory');
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/* ═════════════════════ ٣) الأصناف تحت الحد ═════════════════════ */

export function LowStockSheet({
  visible,
  onClose,
  stock,
}: {
  visible: boolean;
  onClose: () => void;
  stock: VariantStockView[];
}) {
  const { db } = useStore();
  const router = useRouter();

  const view = useMemo(() => {
    // الطلب المعلّق: كم مترًا ينتظره مشروعٌ نشطٌ من كل صنف - وهو الفرق بين
    // «صنفٌ فارغ» و«صنفٌ فارغٌ ينتظره زبون»
    const demand = new Map<string, { m: number; customers: Set<string> }>();
    for (const p of db.projects.filter((x) => x.status !== 'completed')) {
      const customer = db.customers.find((c) => c.id === p.customerId)?.fullName ?? '';
      for (const g of projectFabricGaps(db, p.id)) {
        if (g.remaining <= 0) continue;
        const d = demand.get(g.variantId) ?? { m: 0, customers: new Set<string>() };
        d.m += g.remaining;
        d.customers.add(customer);
        demand.set(g.variantId, d);
      }
    }

    const low = stock
      .filter((g) => g.availableM < LOW_STOCK_THRESHOLD_M)
      .sort((a, b) => a.availableM - b.availableM);
    const near = stock.filter(
      (g) => g.availableM >= LOW_STOCK_THRESHOLD_M && g.availableM < LOW_STOCK_THRESHOLD_M * 2,
    );
    return { low, near, demand };
  }, [db, stock]);

  const shown = view.low.slice(0, 5);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="أصناف تحت الحد"
      subtitle={`الحد ${LOW_STOCK_THRESHOLD_M} مترًا على مجموع أمتار الصنف · المتاح = الموجود − المحجوز`}
    >
      {view.low.length === 0 ? (
        <EmptyState icon={<Layers size={26} color={palette.olive} />} title="لا صنف تحت الحد" body="كل الأصناف فوق حدّها اليوم." />
      ) : (
        <>
          {shown.map((g, i) => {
            const d = view.demand.get(g.variantId);
            const names = d ? Array.from(d.customers).filter(Boolean) : [];
            return (
              <View key={g.variantId}>
                {i > 0 && <Divider />}
                <SheetRow
                  swatch={g.variant?.colorHex ?? null}
                  title={`${g.product?.name ?? ''} - ${g.variant?.colorName ?? ''}`}
                  subtitle={g.product?.kind === 'lining' ? 'بطانة' : undefined}
                  note={
                    d
                      ? `مطلوب ${meters(d.m)} ${
                          names.length === 1 ? `لمشروع ${names[0]}` : `لـ${names.length} مشاريع`
                        }`
                      : 'لا طلب معلّق'
                  }
                  noteColor={d ? palette.danger : palette.muted}
                  value={meters(g.availableM)}
                  valueColor={availabilityTone(g.availableM) === 'danger' ? palette.danger : palette.warning}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/stock/[variantId]', params: { variantId: g.variantId } });
                  }}
                />
                {g.consignedM > 0 && (
                  <AppText variant="caption" color={palette.muted} style={{ paddingBottom: 6 }}>
                    {`منها ${meters(g.consignedM)} أمانةً عند خياط`}
                  </AppText>
                )}
              </View>
            );
          })}
          {view.near.length > 0 && (
            <>
              <Divider />
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/inventory');
                }}
                accessibilityRole="button"
              >
                <AppText variant="caption" color={palette.warning} style={{ paddingVertical: spacing.sm }}>
                  {`${view.near.length} صنفًا يقترب من الحد (${LOW_STOCK_THRESHOLD_M}-${LOW_STOCK_THRESHOLD_M * 2} مترًا)`}
                </AppText>
              </Pressable>
            </>
          )}
          <Tail
            hidden={view.low.length - shown.length}
            label="صنفًا آخر"
            onPress={() => {
              onClose();
              router.push('/(tabs)/inventory');
            }}
          />
        </>
      )}
    </Sheet>
  );
}

/* ═════════════════════ ٤) متوسط نسبة الربح ═════════════════════ */

export function MarginSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const router = useRouter();

  const view = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const approvedAll = db.quotationVersions.filter((v) => v.status === 'approved');
    const thisMonth = approvedAll.filter(
      (v) => v.approvedAt && new Date(v.approvedAt) >= monthStart,
    );
    // النطاق يُقال صراحةً: البلاطة تسقط من الشهر إلى كل الوقت صمتًا
    const pool: QuotationVersion[] = thisMonth.length > 0 ? thisMonth : approvedAll;
    const isMonth = thisMonth.length > 0;

    const simple =
      pool.length > 0 ? pool.reduce((s, v) => s + v.marginPercent, 0) / pool.length : 0;
    // المقام إيرادٌ بلا ضريبة: ضريبة الدولة ليست إيرادًا، وقسمةٌ عليها
    // تعطي هامشًا أعلى من الحقيقة
    const revenueEx = pool.reduce((s, v) => s + (v.totalAgorot - v.vatAgorot), 0);
    const cost = pool.reduce(
      (s, v) => s + v.items.reduce((x, i) => x + i.internalCostAgorot, 0),
      0,
    );
    const weighted = revenueEx > 0 ? ((revenueEx - cost) / revenueEx) * 100 : 0;

    // عرضٌ بنسختين معتمدتين يُعدّ مرتين - يُسمّى ولا يُصحَّح صمتًا
    const perQuotation = new Map<string, number>();
    for (const v of pool) perQuotation.set(v.quotationId, (perQuotation.get(v.quotationId) ?? 0) + 1);
    const doubled = Array.from(perQuotation.values()).filter((n) => n > 1).length;

    const min = db.settings.minMarginPercent;
    const below = pool.filter((v) => v.marginPercent < min);

    const worst = [...pool]
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, 3)
      .map((v) => {
        const q = db.quotations.find((x) => x.id === v.quotationId);
        const p = db.projects.find((x) => x.id === q?.projectId);
        const customer = db.customers.find((c) => c.id === p?.customerId);
        return { v, code: p?.code ?? '', customer: customer?.fullName ?? '', projectId: p?.id };
      });

    return { pool, isMonth, simple, weighted, revenueEx, cost, min, below, worst, doubled };
  }, [db]);

  const monthLabel = `${new Date().getMonth() + 1}.${new Date().getFullYear()}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="متوسط نسبة الربح"
      subtitle={
        view.pool.length === 0
          ? 'لا عرض معتمد بعد'
          : view.isMonth
            ? `متوسط ${view.pool.length} نسخة معتمدة في ${monthLabel}`
            : `لا اعتماد هذا الشهر - المعروض متوسط كل المعتمد (${view.pool.length} نسخة)`
      }
    >
      {view.pool.length === 0 ? (
        <EmptyState icon={<TrendingUp size={26} color={palette.olive} />} title="لا عرض معتمد" body="النسبة تُحسب على العروض التي وقّعها الزبون." />
      ) : (
        <>
          {view.doubled > 0 && (
            <Banner
              tone="warning"
              title={`${view.doubled} عرضًا بأكثر من نسخة معتمدة`}
              body="الرقم يعدّ هذه العروض مرتين - راجعها في شاشة العروض."
            />
          )}
          <Row justify="space-between" style={{ paddingVertical: spacing.sm }}>
            <AppText variant="label">{`بسيط ${percent(view.simple)}`}</AppText>
            <AppText variant="label">{`مرجّح ${percent(view.weighted)}`}</AppText>
          </Row>
          <AppText variant="caption" color={palette.muted}>
            {`الحد الأدنى ${percent(view.min)} · المرجّح يزن العروض الكبيرة أكثر`}
          </AppText>
          <Divider />
          <AppText variant="caption" color={palette.muted} style={{ paddingVertical: spacing.sm }}>
            {`إيراد بلا ضريبة ${money(view.revenueEx)} − كلفة ${money(view.cost)} = ربح ${money(view.revenueEx - view.cost)}`}
          </AppText>
          <Divider />
          <AppText
            variant="caption"
            color={view.below.length > 0 ? palette.danger : palette.success}
            style={{ paddingVertical: spacing.sm }}
          >
            {view.below.length > 0
              ? `تحت الحد: ${view.below.length} نسخة بقيمة ${money(view.below.reduce((s, v) => s + v.totalAgorot, 0))}`
              : 'لا نسخة تحت الحد'}
          </AppText>
          {view.worst.map((w, i) => (
            <View key={w.v.id}>
              {i > 0 && <Divider />}
              <SheetRow
                title={w.customer}
                subtitle={w.code}
                value={percent(w.v.marginPercent)}
                valueColor={w.v.marginPercent < view.min ? palette.danger : palette.olive}
                pill={w.v.discountPercent > 0 ? `خصم ${w.v.discountPercent}%` : 'تسعير'}
                onPress={
                  w.projectId
                    ? () => {
                        onClose();
                        router.push({
                          pathname: '/project/[id]',
                          params: { id: w.projectId as string, tab: 'quote' },
                        });
                      }
                    : undefined
                }
              />
            </View>
          ))}
        </>
      )}
    </Sheet>
  );
}

/* ═════════════════════ ٥) مبيعات آخر ٦ أشهر ═════════════════════ */

export function SalesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db } = useStore();
  const router = useRouter();

  const view = useMemo(() => {
    // التسمية والمحاذاة من مصدرٍ واحد مع شاشة الاستهلاك: مفتاح YYYY-MM
    // ولافتة M.YYYY - فلا تنقلب الصيغة بين شاشتين
    const buckets = monthlyConsumption(db, 6);
    const approved = db.quotationVersions.filter((v) => v.status === 'approved' && v.approvedAt);

    const rows = buckets.map((b) => {
      const inMonth = approved.filter((v) => (v.approvedAt ?? '').slice(0, 7) === b.key);
      // العكس يُخزَّن بمبلغ سالب، فالجمع صافٍ بذاته
      const collected = db.payments
        .filter((p) => p.createdAt.slice(0, 7) === b.key)
        .reduce((s, p) => s + p.amountAgorot, 0);
      return {
        key: b.key,
        label: b.label,
        total: inMonth.reduce((s, v) => s + v.totalAgorot, 0),
        vat: inMonth.reduce((s, v) => s + v.vatAgorot, 0),
        count: inMonth.length,
        collected,
        overM: b.overM,
      };
    });

    return {
      rows,
      total: rows.reduce((s, r) => s + r.total, 0),
      vat: rows.reduce((s, r) => s + r.vat, 0),
      overM: rows.reduce((s, r) => s + r.overM, 0),
    };
  }, [db]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="مبيعات آخر ٦ أشهر"
      subtitle="شهر الاعتماد لا شهر الإنشاء · المبلغ شامل الضريبة كما وقّعه الزبون"
    >
      {view.total === 0 ? (
        <EmptyState icon={<BarChart3 size={26} color={palette.olive} />} title="لا مبيعات بعد" body="أول عرضٍ يعتمده الزبون يظهر في شهره." />
      ) : (
        <>
          {view.rows.map((r, i) => (
            <View key={r.key}>
              {i > 0 && <Divider />}
              <SheetRow
                title={r.label}
                subtitle={r.count > 0 ? `${r.count} نسخة معتمدة` : undefined}
                value={r.total > 0 ? money(r.total) : '—'}
                note={r.collected > 0 ? `محصَّل ${money(r.collected)}` : undefined}
                onPress={() => {
                  onClose();
                  router.push('/reports');
                }}
              />
            </View>
          ))}
          <Divider />
          <AppText variant="caption" color={palette.muted} style={{ paddingTop: spacing.sm }}>
            {`إجمالي الستة ${money(view.total)} - منها ضريبة ${money(view.vat)}، فالإيراد بلا ضريبة ${money(view.total - view.vat)}.`}
          </AppText>
          {view.overM > 0 && (
            <Pressable
              onPress={() => {
                onClose();
                router.push('/consumption');
              }}
              accessibilityRole="button"
            >
              <AppText variant="caption" color={palette.warning} style={{ paddingTop: 4 }}>
                {`فوق المخطط ${meters(view.overM)}`}
              </AppText>
            </Pressable>
          )}
          <AppText variant="caption" color={palette.muted} style={{ paddingTop: 4 }}>
            الشيك محسوب يوم استلامه لا يوم صرفه · المبالغ صافية بعد قيود العكس.
          </AppText>
        </>
      )}
    </Sheet>
  );
}

export type DashboardSheetKey = 'projects' | 'fabric' | 'stock' | 'margin' | 'sales';

export function DashboardSheets({
  open,
  onClose,
  stock,
}: {
  open: DashboardSheetKey | null;
  onClose: () => void;
  stock: VariantStockView[];
}) {
  return (
    <>
      <ActiveProjectsSheet visible={open === 'projects'} onClose={onClose} />
      <ReservedFabricSheet visible={open === 'fabric'} onClose={onClose} />
      <LowStockSheet visible={open === 'stock'} onClose={onClose} stock={stock} />
      <MarginSheet visible={open === 'margin'} onClose={onClose} />
      <SalesSheet visible={open === 'sales'} onClose={onClose} />
    </>
  );
}

/** يُستعمل في الشاشة لا هنا - يمنع تحذير الاستيراد غير المستعمَل. */
export type { Database };
