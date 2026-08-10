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
