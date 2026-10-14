/**
 * إعدادات الإشعارات - القواعد البحتة.
 *
 * كلّ دورٍ يرى أنواع الإشعارات التي تصله فعلًا، لا قائمةً بكلّ ما في
 * القاعدة: الخياط لا يصله «استلام بضاعة»، فمفتاحٌ له في شاشته ضجيج.
 * والخريطة مأخوذةٌ من دوال القاعدة التي تكتب الإشعارات (راجع DECISIONS §12).
 */
import type { NotificationKind, Role } from '@/types/domain';

export interface KindInfo {
  label: string;
  description: string;
}

export const KIND_INFO: Record<Exclude<NotificationKind, 'sync_failed'>, KindInfo> = {
  visit_assigned: { label: 'زيارة مُسندة إليك', description: 'حين تُسند إليك زيارة قياس أو تركيب' },
  appointment_tomorrow: { label: 'تذكير موعد الغد', description: 'مساء اليوم الذي يسبق كلّ زيارة لك' },
  tailor_assignment: { label: 'عمل خياطة جديد', description: 'حين يُسند إليك مشروع للخياطة' },
  ready_for_install: { label: 'جاهز للتركيب', description: 'حين تنتهي الخياطة ويصير المشروع جاهزًا' },
  discount_request: { label: 'طلبات الخصم', description: 'طلب خصم جديد، أو قرارٌ على طلبك' },
  low_stock: { label: 'تنبيهات المخزون', description: 'استهلاك فوق المخطّط، أو تلف في قماش محجوز' },
  stock_received: { label: 'استلام بضاعة', description: 'حين يُسجَّل رول جديد في المخزون' },
  payment: { label: 'الدفعات', description: 'حين تُصرف لك دفعة' },
  project_annex: { label: 'ملحق مشروع', description: 'حين يُفتح ملحق لمشروع قائم' },
};

// بترتيب الأهمية لكلّ دور. sync_failed لا كاتب له في القاعدة، فلا مفتاح له
const BY_ROLE: Record<Role, (keyof typeof KIND_INFO)[]> = {
  admin: [
    'discount_request', 'ready_for_install', 'low_stock', 'stock_received', 'project_annex',
    'visit_assigned', 'appointment_tomorrow', 'payment',
  ],
  sales: ['discount_request', 'visit_assigned', 'appointment_tomorrow', 'ready_for_install', 'payment'],
  field: ['visit_assigned', 'appointment_tomorrow', 'ready_for_install', 'discount_request', 'payment'],
  tailor: ['tailor_assignment', 'payment'],
};

export function kindsForRole(role: Role | null | undefined): (keyof typeof KIND_INFO)[] {
  return role ? BY_ROLE[role] : [];
}

/** يقلب نوعًا بين مطفأ ومشغَّل، ويعيد قائمةً مرتّبة بلا تكرار - كما تحفظها القاعدة. */
export function toggleMuted(muted: readonly NotificationKind[], kind: NotificationKind): NotificationKind[] {
  const set = new Set(muted);
  if (set.has(kind)) set.delete(kind);
  else set.add(kind);
  return [...set].sort();
}

/** ساعات التذكير المعروضة: المساء المعتاد، وما اختاره الأدمن إن كان خارجه. */
export function reminderHourOptions(current: number): number[] {
  const base = [14, 15, 16, 17, 18, 19, 20, 21, 22];
  return base.includes(current) ? base : [...base, current].sort((a, b) => a - b);
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
