/**
 * عائلة المشروع: الأصل وملاحقه.
 *
 * منطقٌ صافٍ بلا واجهة - يحتاجه المتجر والشاشة والاختبارات معًا، ويجب أن
 * يبقى مرآةً حرفية لعرض `api.project_family_finance` على الخادم: الرقم
 * الذي يراه المالك في التطبيق هو الذي يقرؤه محاسبه من القاعدة.
 */
import type { Database } from '@/data/seed';
import { currentVersion } from '@/domain/quotations';
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

/**
 * الجذور وحدها.
 *
 * كل شاشةٍ تجمع مالًا أو تبوّب مشاريع بالمستحق تمشي على هذه القائمة: الملحق
 * لا يحمل دفترًا، فصفٌّ له في قائمة الديون يعني عائلةً حُسبت مرتين ودَينًا
 * لا يمحوه دفعٌ - لأن الدفع عليه ممنوع في القاعدة أصلًا.
 */
export function rootProjects(db: Database): Project[] {
  return db.projects.filter((p) => !p.parentProjectId);
}

/** قيمة مستندٍ واحد كما وقّعه الزبون - للملحق حين يُعرض صفًّا مستقلًا. */
export function projectOwnApprovedAgorot(db: Database, projectId: UUID): number {
  return db.quotationVersions
    .filter(
      (v) =>
        v.status === 'approved' &&
        db.quotations.some((q) => q.id === v.quotationId && q.projectId === projectId),
    )
    .reduce((s, v) => s + v.totalAgorot, 0);
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

export type ProjectBalance = {
  totalAgorot: number;
  paidAgorot: number;
  dueAgorot: number;
  paidRatio: number;
};

/**
 * رصيد الزبون على العائلة - لا على المستند.
 *
 * الدفعات تُسجَّل على الجذر بقيدٍ في القاعدة (محفّز `payments_target_root`)،
 * فقراءة إجمالي مستندٍ واحد مع دفعات العائلة كلها كانت تُنقص الدَّين بقيمة
 * الملاحق: شاشةٌ تعرض رقمين متناقضين، وملحقٌ يبقى دَينًا لا يمحوه دفعٌ لأن
 * الدفع عليه ممنوع أصلًا. يُمرَّر أي معرّف من العائلة ويُردّ رصيدها الواحد.
 *
 * ولمن لم يوقّع بعد: تُعرض المسوَّدة توقّعًا كما كانت - للأصل وحده، فمسوَّدة
 * الملحق دَينٌ لم يقبله أحد.
 */
export function projectBalance(db: Database, projectId: UUID): ProjectBalance {
  const fam = projectFamilyFinance(db, projectId);
  const draft =
    fam.originalAgorot === 0 ? (currentVersion(db, fam.rootId)?.totalAgorot ?? 0) : 0;
  const totalAgorot = fam.totalAgorot + draft;
  const paidAgorot = fam.paidAgorot;
  return {
    totalAgorot,
    paidAgorot,
    dueAgorot: Math.max(0, totalAgorot - paidAgorot),
    paidRatio: totalAgorot > 0 ? Math.min(1, paidAgorot / totalAgorot) : 0,
  };
}
