/**
 * Arabic labels + lifecycle helpers for the documented project pipeline.
 */

import { palette } from '@/constants/theme';
import type {
  AttachmentKind,
  NotificationKind,
  PaymentKind,
  PaymentMethod,
  Priority,
  ProjectStatus,
  QuotationStatus,
  SyncState,
  TailorStage,
  TrackType,
  VisitStatus,
  VisitType,
} from '@/types/domain';

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  'new_request',
  'awaiting_measurement',
  'measured',
  'quotation',
  'customer_approved',
  'fabric_allocated',
  'with_tailor',
  'ready_for_install',
  'installed',
  'completed',
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  new_request: 'طلب جديد',
  awaiting_measurement: 'بانتظار القياس',
  measured: 'تم القياس',
  quotation: 'عرض السعر',
  customer_approved: 'موافقة الزبون',
  fabric_allocated: 'تخصيص القماش',
  with_tailor: 'مع الخياط',
  ready_for_install: 'جاهز للتركيب',
  installed: 'تم التركيب',
  completed: 'مكتمل',
};

export const PROJECT_STATUS_HINTS: Record<ProjectStatus, string> = {
  new_request: 'إنشاء الزبون والمشروع',
  awaiting_measurement: 'تعيين العامل الميداني',
  measured: 'غرف، شبابيك، صور، ملاحظات',
  quotation: 'حساب تلقائي وخصم',
  customer_approved: 'نسخة معتمدة ودفعة أولى',
  fabric_allocated: 'اختيار الرول والحجز',
  with_tailor: 'قص، خياطة، استهلاك',
  ready_for_install: 'موعد ومهمة ميدانية',
  installed: 'صور وتأكيد الزبون',
  completed: 'تحصيل وإغلاق',
};

export function projectStatusColor(status: ProjectStatus): { bg: string; fg: string } {
  switch (status) {
    case 'new_request':
    case 'awaiting_measurement':
      return { bg: palette.warningSoft, fg: palette.warning };
    case 'measured':
    case 'quotation':
      return { bg: palette.infoSoft, fg: palette.info };
    case 'customer_approved':
    case 'fabric_allocated':
    case 'with_tailor':
      return { bg: palette.terracottaSoft, fg: palette.terracotta };
    case 'ready_for_install':
    case 'installed':
      return { bg: palette.sageSoft, fg: palette.olive };
    case 'completed':
    default:
      return { bg: palette.successSoft, fg: palette.success };
  }
}

export function nextStatus(status: ProjectStatus): ProjectStatus | null {
  const i = PROJECT_STATUS_ORDER.indexOf(status);
  if (i < 0 || i === PROJECT_STATUS_ORDER.length - 1) return null;
  return PROJECT_STATUS_ORDER[i + 1];
}

export function statusProgress(status: ProjectStatus): number {
  const i = PROJECT_STATUS_ORDER.indexOf(status);
  return (i + 1) / PROJECT_STATUS_ORDER.length;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'عادية',
  normal: 'متوسطة',
  high: 'عاجلة',
};

export const TRACK_LABELS: Record<TrackType, string> = {
  standard: 'مسار عادي',
  motorized: 'مسار كهربائي',
};

export const TAILOR_STAGE_ORDER: TailorStage[] = [
  'received',
  'cutting',
  'sewing',
  'ironing',
  'qc',
  'ready',
];

export const TAILOR_STAGE_LABELS: Record<TailorStage, string> = {
  received: 'استلام القماش',
  cutting: 'القص',
  sewing: 'الخياطة',
  ironing: 'الكي',
  qc: 'فحص الجودة',
  ready: 'جاهز',
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  approved: 'معتمد',
  rejected: 'مرفوض',
  expired: 'منتهي',
  superseded: 'مُستبدَل',
};

export function quotationStatusColor(status: QuotationStatus): { bg: string; fg: string } {
  switch (status) {
    case 'draft':
      return { bg: palette.sand, fg: palette.muted };
    case 'sent':
      return { bg: palette.infoSoft, fg: palette.info };
    case 'approved':
      return { bg: palette.successSoft, fg: palette.success };
    case 'rejected':
      return { bg: palette.dangerSoft, fg: palette.danger };
    case 'superseded':
      return { bg: palette.sand, fg: palette.muted };
    case 'expired':
    default:
      return { bg: palette.warningSoft, fg: palette.warning };
  }
}

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  measurement: 'زيارة قياس',
  installation: 'زيارة تركيب',
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'مجدولة',
  in_progress: 'جارية',
  completed: 'مكتملة',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: 'دفعة أولى',
  milestone: 'دفعة مرحلية',
  final: 'الدفعة الأخيرة',
  reversal: 'عكس دفعة',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  transfer: 'تحويل بنكي',
  check: 'شيك',
  card: 'بطاقة',
};

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  measurement: 'صورة قياس',
  before_install: 'قبل التركيب',
  after_install: 'بعد التركيب',
  fabric: 'عينة قماش',
  document: 'مستند',
};

export const SYNC_LABELS: Record<SyncState, string> = {
  saved_local: 'تم الحفظ على الجهاز',
  pending: 'بانتظار المزامنة',
  syncing: 'جارٍ الرفع',
  synced: 'تمت المزامنة',
  failed: 'تعذرت المزامنة',
  needs_review: 'يحتاج مراجعة',
};

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  discount_request: 'طلب خصم',
  tailor_assignment: 'مهمة خياطة',
  visit_assigned: 'زيارة جديدة',
  ready_for_install: 'جاهز للتركيب',
  appointment_tomorrow: 'موعد غدًا',
  sync_failed: 'فشل مزامنة',
  low_stock: 'مخزون منخفض',
  stock_received: 'إضافة بضاعة',
  payment: 'دفعة',
  project_annex: 'ملحق جديد',
};
