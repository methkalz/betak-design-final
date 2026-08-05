/**
 * ملف الموظف - ما ينجزه وما بين يديه الآن.
 *
 * دوال خالصة على القاعدة، ليبقى الحساب مستقلًا عن الشاشة وقابلًا للاختبار.
 *
 * قاعدة حاكمة هنا: لا يُختلق مؤشر لدور لا يملك أساسه في البيانات. الخياط له
 * موعد تسليم فله «التزام بالموعد»، والعامل الميداني له موعد زيارة فله المثل.
 * أما المبيعات فلا موعد لها في القاعدة، ولو عرضنا لها نسبة التزام لكانت رقمًا
 * جميلًا بلا معنى - وذاك أسوأ من فراغ صريح.
 */
import type { Database } from '@/data/seed';
import { round3 } from '@/domain/pricing';
import type { Role, UUID } from '@/types/domain';

const DAY = 24 * 60 * 60 * 1000;

function startOfMonth(now: number): number {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** مقارنة باليوم لا بالدقيقة: زيارةٌ أُنجزت مساء يومها ليست متأخرة. */
function dayOf(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type StaffTask = {
  id: UUID;
  projectId: UUID;
  title: string;
  hint: string;
  dueAt: string | null;
  overdue: boolean;
};

export type StaffMetric = {
  label: string;
  value: string;
  /** يشدّ الانتباه حين يستحق - لا لكل رقم. */
  alarming?: boolean;
};

export type StaffDossier = {
  role: Role;
  open: StaffTask[];
  metrics: StaffMetric[];
  /** آخر أثر له في سجل التدقيق. */
  lastActiveAt: string | null;
};

function pct(part: number, whole: number): string {
  if (whole === 0) return '-';
  return `${Math.round((part / whole) * 100)}%`;
}

export function staffDossier(db: Database, profileId: UUID, now: number): StaffDossier {
  const profile = db.profiles.find((p) => p.id === profileId);
  const role: Role = profile?.role ?? 'field';
  const monthStart = startOfMonth(now);
  const lastLog = db.auditLogs
    .filter((l) => l.actorId === profileId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const titleOf = (projectId: UUID) =>
    db.projects.find((p) => p.id === projectId)?.title ?? 'مشروع';

  if (role === 'tailor') {
    const mine = db.tailorAssignments.filter((a) => a.tailorId === profileId);
    const open = mine.filter((a) => !a.completedAt);
    const done = mine.filter((a) => !!a.completedAt);
    const doneThisMonth = done.filter((a) => new Date(a.completedAt!).getTime() >= monthStart);
    const onTime = done.filter((a) => dayOf(a.completedAt!) <= dayOf(a.dueDate));
    const turnarounds = done
      .filter((a) => a.startedAt)
      .map((a) => (new Date(a.completedAt!).getTime() - new Date(a.startedAt!).getTime()) / DAY);

    // الهدر يُنسب للخياط عبر مشاريعه - هو من يقصّ
    const projectIds = new Set(
      db.projects.filter((p) => p.tailorId === profileId).map((p) => p.id),
    );
    const usages = db.usages.filter((u) => projectIds.has(u.projectId));
    const actual = usages.reduce((s, u) => s + u.actualM, 0);
    const waste = usages.reduce((s, u) => s + u.wasteM, 0);
    const wasteRatio = actual > 0 ? waste / actual : null;

    const overdueCount = open.filter((a) => dayOf(a.dueDate) < dayOf(new Date(now).toISOString())).length;

    return {
      role,
      lastActiveAt: lastLog?.createdAt ?? null,
      open: open.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        title: titleOf(a.projectId),
        hint: a.instructions,
        dueAt: a.dueDate,
        overdue: dayOf(a.dueDate) < dayOf(new Date(now).toISOString()),
      })),
      metrics: [
        { label: 'أوامر مفتوحة', value: String(open.length), alarming: overdueCount > 0 },
        { label: 'متأخرة عن التسليم', value: String(overdueCount), alarming: overdueCount > 0 },
        { label: 'أنجز هذا الشهر', value: String(doneThisMonth.length) },
        { label: 'التزام بالموعد', value: pct(onTime.length, done.length) },
        {
          label: 'متوسط مدة الأمر',
          value: turnarounds.length
            ? `${round3(turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length).toFixed(1)} يوم`
            : '-',
        },
        {
          label: 'نسبة الهدر',
          value: wasteRatio === null ? '-' : `${(wasteRatio * 100).toFixed(1)}%`,
          alarming: wasteRatio !== null && wasteRatio > 0.08,
        },
      ],
    };
  }

  if (role === 'field') {
    const mine = db.fieldVisits.filter((v) => v.assigneeId === profileId);
    const open = mine.filter((v) => v.status !== 'completed');
    const done = mine.filter((v) => v.status === 'completed' && v.completedAt);
    const doneThisMonth = done.filter((v) => new Date(v.completedAt!).getTime() >= monthStart);
    const onTime = done.filter((v) => dayOf(v.completedAt!) <= dayOf(v.scheduledAt));
    const installs = done.filter((v) => v.type === 'installation');
    const signed = installs.filter((v) => v.customerSignedOff);
    const overdueCount = open.filter(
      (v) => dayOf(v.scheduledAt) < dayOf(new Date(now).toISOString()),
    ).length;

    return {
      role,
      lastActiveAt: lastLog?.createdAt ?? null,
      open: open.map((v) => ({
        id: v.id,
        projectId: v.projectId,
        title: titleOf(v.projectId),
        hint: v.type === 'measurement' ? 'زيارة قياس' : 'زيارة تركيب',
        dueAt: v.scheduledAt,
        overdue: dayOf(v.scheduledAt) < dayOf(new Date(now).toISOString()),
      })),
      metrics: [
        { label: 'زيارات قادمة', value: String(open.length), alarming: overdueCount > 0 },
        { label: 'فات موعدها', value: String(overdueCount), alarming: overdueCount > 0 },
        { label: 'أنجز هذا الشهر', value: String(doneThisMonth.length) },
        { label: 'التزام بالموعد', value: pct(onTime.length, done.length) },
        { label: 'تركيبات موقّعة', value: pct(signed.length, installs.length) },
        {
          label: 'مشاريع مسندة',
          value: String(db.projects.filter((p) => p.fieldWorkerId === profileId).length),
        },
      ],
    };
  }

  // المبيعات والأدمن: ما يقيسهما فعلًا هو العروض والتحصيل
  const versions = db.quotationVersions.filter((v) => v.createdBy === profileId);
  const approved = versions.filter((v) => v.status === 'approved');
  const thisMonth = versions.filter((v) => new Date(v.createdAt).getTime() >= monthStart);
  const payments = db.payments.filter(
    (p) => p.createdBy === profileId && new Date(p.createdAt).getTime() >= monthStart,
  );

  return {
    role,
    lastActiveAt: lastLog?.createdAt ?? null,
    open: [],
    metrics: [
      { label: 'عروض هذا الشهر', value: String(thisMonth.length) },
      { label: 'نسبة الاعتماد', value: pct(approved.length, versions.length) },
      { label: 'دفعات سجّلها هذا الشهر', value: String(payments.length) },
      {
        label: 'مشاريع نشطة',
        value: String(db.projects.filter((p) => p.status !== 'completed').length),
      },
    ],
  };
}
