/**
 * عائلة المشروع: الأصل وملاحقه.
 *
 * منطقٌ صافٍ بلا واجهة - يحتاجه المتجر والشاشة والاختبارات معًا، ويجب أن
 * يبقى مرآةً حرفية لعرض `api.project_family_finance` على الخادم: الرقم
 * الذي يراه المالك في التطبيق هو الذي يقرؤه محاسبه من القاعدة.
 */
import type { Database } from '@/data/seed';
import type { Project, UUID } from '@/types/domain';

export type ProjectFamilyFinance = {
  /** جذر العائلة - الأصل الذي تُسجَّل عليه الدفعات. */
  rootId: UUID;
  originalAgorot: number;
  annexAgorot: number;
  totalAgorot: number;
  paidAgorot: number;
  dueAgorot: number;
  annexCount: number;
};

/** الأصل إن كان المُمرَّر ملحقًا، وإلا فهو نفسه. */
export function rootProjectId(db: Database, projectId: UUID): UUID {
  const p = db.projects.find((x) => x.id === projectId);
  return p?.parentProjectId ?? projectId;
}

export function projectAnnexes(db: Database, projectId: UUID): Project[] {
  const root = rootProjectId(db, projectId);
  return db.projects
    .filter((p) => p.parentProjectId === root)
    .sort((a, b) => (a.annexSeq ?? 0) - (b.annexSeq ?? 0));
}

/**
 * الأرقام الثلاثة: الأصل، الملاحق، والإجمالي - مرآة `api.project_family_finance`.
 *
 * المعتمد وحده يُحتسب: ما لم يوقّعه الزبون ليس دَينًا عليه، فالملحق المسوَّد
 * يساهم بصفر حتى يُعتمد. والدفعات تُجمع على الجذر لأنها لا تُسجَّل إلا عليه
 * (قيدٌ في القاعدة لا عُرف) - فالرصيد واحد كما يراه الزبون.
 */
export function projectFamilyFinance(db: Database, projectId: UUID): ProjectFamilyFinance {
  const root = rootProjectId(db, projectId);
  const annexes = projectAnnexes(db, root);
  const approvedTotal = (pid: UUID) =>
    db.quotationVersions
      .filter(
        (v) =>
          v.status === 'approved' &&
          db.quotations.some((q) => q.id === v.quotationId && q.projectId === pid),
      )
      .reduce((s, v) => s + v.totalAgorot, 0);

  const originalAgorot = approvedTotal(root);
  const annexAgorot = annexes.reduce((s, a) => s + approvedTotal(a.id), 0);
  const totalAgorot = originalAgorot + annexAgorot;
  const paidAgorot = db.payments
    .filter((p) => p.projectId === root)
    .reduce((s, p) => s + p.amountAgorot, 0);

  return {
    rootId: root,
    originalAgorot,
    annexAgorot,
    totalAgorot,
    paidAgorot,
    dueAgorot: Math.max(0, totalAgorot - paidAgorot),
    annexCount: annexes.length,
  };
}
