/**
 * نسخة العرض: أيُّها المعتمدة وأيُّها الحالية.
 *
 * منطقٌ صافٍ بلا واجهة - يحتاجه حساب الرصيد والاختبارات معًا. كان يسكن
 * `hooks/selectors` وهو ملفٌ يستورد React، فلا يُختبر.
 */
import type { Database } from '@/data/seed';
import type { QuotationVersion, UUID } from '@/types/domain';

export function currentVersion(db: Database, projectId: UUID): QuotationVersion | null {
  const quotation = db.quotations.find((q) => q.projectId === projectId);
  if (!quotation) return null;
  return db.quotationVersions.find((v) => v.id === quotation.currentVersionId) ?? null;
}

export function approvedVersion(db: Database, projectId: UUID): QuotationVersion | null {
  const quotation = db.quotations.find((q) => q.projectId === projectId);
  if (!quotation) return null;
  const versions = db.quotationVersions
    .filter((v) => v.quotationId === quotation.id && v.status === 'approved')
    .sort((a, b) => b.versionNumber - a.versionNumber);
  return versions[0] ?? null;
}
