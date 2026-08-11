/**
 * تقارير المعرض (M5/M7/M10) - قراءات خالصة فوق ما تكتبه السلسلة.
 *
 * مبدأ النزاهة الحاكم: الربح المعروض هو ربح المحرك (إيراد صافٍ − تكلفة
 * كاملة كما سُعّرت)، ومصاريف الطاقم الفعلية (مستحقات الخياطين وأجور
 * الزيارات) تُعرض سطورًا مستقلة لا تُخصم مرة ثانية - لأن التسعيرة تحمل
 * أصلًا مكوّني خياطة وقياس/تركيب مقدَّرين، وخصم الفعلي فوق المقدَّر يعدّ
 * الكلفة مرتين ويكذب على المالك بربحٍ أنقص من حقيقته.
 */
import type { Database } from '@/data/seed';
import { round3 } from '@/domain/pricing';
import { fieldAccruals, tailorAccruals } from '@/domain/staffLedger';
import type { UUID } from '@/types/domain';

function inMonth(iso: string | null | undefined, year: number, month: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

export type MonthlyReport = {
  year: number;
  month: number; // 0-11
  workshopsCompleted: number;
  metersCut: number;
  wasteM: number;
  approvedCount: number;
  approvedTotalAgorot: number;
  revenueExAgorot: number;
  costAgorot: number;
  profitAgorot: number;
  tailorFeesAgorot: number;
  fieldWagesAgorot: number;
  collectedAgorot: number;
  /** توزيع المبيعات المعتمدة على البلدات - «من أين أتى». */
  byTown: { town: string; totalAgorot: number; count: number }[];
};

/** تقرير شهر واحد - كل سطر منه قابل للجمع اليدوي من السجلات. */
export function monthlyReport(db: Database, year: number, month: number): MonthlyReport {
  const assignments = db.tailorAssignments.filter((a) => inMonth(a.completedAt, year, month));
  const usages = db.usages.filter((u) => inMonth(u.createdAt, year, month));

  const approved = db.quotationVersions.filter(
    (v) => v.status === 'approved' && inMonth(v.approvedAt, year, month),
  );
  const revenueEx = approved.reduce((s, v) => s + (v.totalAgorot - v.vatAgorot), 0);
  const cost = approved.reduce(
    (s, v) => s + v.items.reduce((x, i) => x + i.internalCostAgorot, 0),
    0,
  );

  const tailorFees = db.profiles
    .filter((p) => p.role === 'tailor')
    .flatMap((p) => tailorAccruals(db, p.id))
    .filter((a) => inMonth(a.completedAt, year, month))
    .reduce((s, a) => s + a.feeAgorot, 0);
  const fieldWages = db.profiles
    .filter((p) => p.role === 'field')
    .flatMap((p) => fieldAccruals(db, p.id))
    .filter((a) => inMonth(a.completedAt, year, month))
    .reduce((s, a) => s + a.wageAgorot, 0);

  const collected = db.payments
    .filter((p) => inMonth(p.createdAt, year, month))
    .reduce((s, p) => s + p.amountAgorot, 0);

  const towns = new Map<string, { totalAgorot: number; count: number }>();
  for (const v of approved) {
    const q = db.quotations.find((x) => x.id === v.quotationId);
    const project = db.projects.find((p) => p.id === q?.projectId);
    const town = db.customers.find((c) => c.id === project?.customerId)?.city ?? 'غير محدد';
    const prev = towns.get(town) ?? { totalAgorot: 0, count: 0 };
    towns.set(town, { totalAgorot: prev.totalAgorot + v.totalAgorot, count: prev.count + 1 });
  }

  return {
    year,
    month,
    workshopsCompleted: assignments.length,
    metersCut: round3(usages.reduce((s, u) => s + u.actualM, 0)),
    wasteM: round3(usages.reduce((s, u) => s + u.wasteM, 0)),
    approvedCount: approved.length,
    approvedTotalAgorot: approved.reduce((s, v) => s + v.totalAgorot, 0),
    revenueExAgorot: revenueEx,
    costAgorot: cost,
    profitAgorot: revenueEx - cost,
    tailorFeesAgorot: tailorFees,
    fieldWagesAgorot: fieldWages,
    collectedAgorot: collected,
    byTown: Array.from(towns.entries())
      .map(([town, t]) => ({ town, ...t }))
      .sort((a, b) => b.totalAgorot - a.totalAgorot),
  };
}

export type CustomerProfit = {
  customerId: UUID;
  name: string;
  town: string;
  projectsCount: number;
  approvedTotalAgorot: number;
  revenueExAgorot: number;
  costAgorot: number;
  profitAgorot: number;
  paidAgorot: number;
  dueAgorot: number;
};

/** تقرير الزبائن (M5): ربح وتكلفة كل زبون عبر كل مشاريعه - للأدمن. */
export function customersProfitReport(db: Database): CustomerProfit[] {
  return db.customers
    .map((c) => {
      const projects = db.projects.filter((p) => p.customerId === c.id);
      let approvedTotal = 0;
      let revenueEx = 0;
      let cost = 0;
      let paid = 0;
      for (const p of projects) {
        const q = db.quotations.find((x) => x.projectId === p.id);
        const v = db.quotationVersions.find(
          (x) => x.quotationId === q?.id && x.status === 'approved',
        );
        if (v) {
          approvedTotal += v.totalAgorot;
          revenueEx += v.totalAgorot - v.vatAgorot;
          cost += v.items.reduce((s, i) => s + i.internalCostAgorot, 0);
        }
        paid += db.payments
          .filter((x) => x.projectId === p.id)
          .reduce((s, x) => s + x.amountAgorot, 0);
      }
      return {
        customerId: c.id,
        name: c.fullName,
        town: c.city,
        projectsCount: projects.length,
        approvedTotalAgorot: approvedTotal,
        revenueExAgorot: revenueEx,
        costAgorot: cost,
        profitAgorot: revenueEx - cost,
        paidAgorot: paid,
        dueAgorot: Math.max(0, approvedTotal - paid),
      };
    })
    .filter((c) => c.projectsCount > 0)
    .sort((a, b) => b.profitAgorot - a.profitAgorot);
}

export type DebtRow = {
  projectId: UUID;
  code: string;
  title: string;
  customerName: string;
  totalAgorot: number;
  paidAgorot: number;
  dueAgorot: number;
};

/** فصل المسدَّد عن الديون (M10): لكل مشروع معتمد، ما دُفع وما بقي. */
export function debtsSplit(db: Database): { settled: DebtRow[]; outstanding: DebtRow[] } {
  const rows: DebtRow[] = [];
  for (const p of db.projects) {
    const q = db.quotations.find((x) => x.projectId === p.id);
    const v = db.quotationVersions.find((x) => x.quotationId === q?.id && x.status === 'approved');
    if (!v) continue;
    const paid = db.payments
      .filter((x) => x.projectId === p.id)
      .reduce((s, x) => s + x.amountAgorot, 0);
    rows.push({
      projectId: p.id,
      code: p.code,
      title: p.title,
      customerName: db.customers.find((c) => c.id === p.customerId)?.fullName ?? '-',
      totalAgorot: v.totalAgorot,
      paidAgorot: paid,
      dueAgorot: Math.max(0, v.totalAgorot - paid),
    });
  }
  return {
    settled: rows.filter((r) => r.dueAgorot === 0).sort((a, b) => b.totalAgorot - a.totalAgorot),
    outstanding: rows.filter((r) => r.dueAgorot > 0).sort((a, b) => b.dueAgorot - a.dueAgorot),
  };
}

/* ═══════════════ تقرير الاستهلاك (قرار المالك 11.8.2026) ═══════════════ */

export type MonthConsumption = {
  /** YYYY-MM للترتيب. */
  key: string;
  /** للعرض: 8.2026 */
  label: string;
  plannedM: number;
  actualM: number;
  /** ما زاد عن المخطط - موجب فقط. */
  overM: number;
};

/**
 * المخطط مقابل المستهلك شهرًا بشهر، من سجلات الإنهاء نفسها.
 *
 * كل سجل استهلاك يحمل مخططه وفعليّه معًا (`plannedM`/`actualM`)، فالمقارنة
 * تُقرأ من المصدر لا تُركَّب من جدولين قد يختلف عدُّهما. الأشهر الفارغة
 * تظهر بصفرها - غيابها يجعل الرسم يقفز فوق شهرٍ لم يُعمل فيه.
 */
export function monthlyConsumption(db: Database, months = 6): MonthConsumption[] {
  const out: MonthConsumption[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: `${d.getMonth() + 1}.${d.getFullYear()}`, plannedM: 0, actualM: 0, overM: 0 });
  }
  const byKey = new Map(out.map((m) => [m.key, m]));
  for (const u of db.usages) {
    const d = new Date(u.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = byKey.get(key);
    if (!m) continue;
    m.plannedM = round3(m.plannedM + u.plannedM);
    m.actualM = round3(m.actualM + u.actualM);
    if (u.actualM > u.plannedM) m.overM = round3(m.overM + (u.actualM - u.plannedM));
  }
  return out;
}

export type OverrunRow = {
  usageId: UUID;
  projectId: UUID;
  projectTitle: string;
  windowName: string;
  byName: string;
  overM: number;
  overPct: number;
  notes: string;
  createdAt: string;
};

/**
 * الزيادات الواضحة: كل إنهاءٍ استهلك فوق مخططه، الأكبر أولًا.
 *
 * قائمة استثناءاتٍ لا سجلٌّ كامل - توصية لوحات الفروقات: الشاذّ يتصدّر
 * والمطابق للخطة لا يُسرد أصلًا، فالعين تفحص ما يحتاج فحصًا فقط.
 */
export function consumptionOverruns(db: Database, sinceDays = 180): OverrunRow[] {
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const rows: OverrunRow[] = [];
  for (const u of db.usages) {
    if (new Date(u.createdAt).getTime() < since) continue;
    const over = round3(u.actualM - u.plannedM);
    if (over <= 0) continue;
    const win = db.windows.find((w) => w.id === u.windowId);
    const project = db.projects.find((p) => p.id === u.projectId);
    rows.push({
      usageId: u.id,
      projectId: u.projectId,
      projectTitle: project?.title ?? '',
      windowName: win?.name ?? 'شباك',
      byName: db.profiles.find((p) => p.id === u.createdBy)?.fullName ?? '',
      overM: over,
      overPct: u.plannedM > 0 ? Math.round((over / u.plannedM) * 1000) / 10 : 100,
      notes: u.notes,
      createdAt: u.createdAt,
    });
  }
  return rows.sort((a, b) => b.overM - a.overM);
}

export type VariantMonthConsumption = {
  variantId: UUID;
  name: string;
  colorHex: string;
  meters: number;
};

/** استهلاك الشهر الجاري موزَّعًا على الأصناف - عبر رول كل سجل. */
export function monthConsumptionByVariant(db: Database): VariantMonthConsumption[] {
  const now = new Date();
  const map = new Map<UUID, VariantMonthConsumption>();
  for (const u of db.usages) {
    const d = new Date(u.createdAt);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    const roll = db.fabricRolls.find((r) => r.id === u.rollId);
    if (!roll) continue;
    const v = db.fabricVariants.find((x) => x.id === roll.variantId);
    const p = db.fabricProducts.find((x) => x.id === v?.productId);
    let g = map.get(roll.variantId);
    if (!g) {
      g = {
        variantId: roll.variantId,
        name: `${p?.name ?? ''} ${v?.colorName ?? ''}`.trim(),
        colorHex: v?.colorHex ?? '#DDD',
        meters: 0,
      };
      map.set(roll.variantId, g);
    }
    g.meters = round3(g.meters + u.actualM);
  }
  return Array.from(map.values()).sort((a, b) => b.meters - a.meters);
}
