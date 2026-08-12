/**
 * Role capability matrix — mirrors the RLS/grants strategy on the server.
 * The UI never relies on hiding alone; every sensitive action is re-checked
 * before it is executed in `useStore`.
 */

import type { Role } from '@/types/domain';

export type Capability =
  | 'view_cost_and_margin'
  | 'edit_pricing_rules'
  | 'manage_customers'
  | 'enter_measurements'
  | 'reserve_fabric'
  | 'update_production'
  | 'record_payment'
  | 'approve_discount'
  | 'manage_users'
  | 'manage_fabrics'
  | 'receive_own_fabric'
  | 'view_reports'
  | 'create_quotation'
  | 'install';

type Level = 'yes' | 'limited' | 'read' | 'no';

const MATRIX: Record<Capability, Record<Role, Level>> = {
  view_cost_and_margin: { admin: 'yes', sales: 'limited', field: 'no', tailor: 'no' },
  edit_pricing_rules: { admin: 'yes', sales: 'no', field: 'no', tailor: 'no' },
  manage_customers: { admin: 'yes', sales: 'yes', field: 'limited', tailor: 'no' },
  enter_measurements: { admin: 'yes', sales: 'yes', field: 'yes', tailor: 'no' },
  reserve_fabric: { admin: 'yes', sales: 'limited', field: 'no', tailor: 'no' },
  update_production: { admin: 'yes', sales: 'read', field: 'no', tailor: 'yes' },
  record_payment: { admin: 'yes', sales: 'yes', field: 'no', tailor: 'no' },
  approve_discount: { admin: 'yes', sales: 'no', field: 'no', tailor: 'no' },
  manage_users: { admin: 'yes', sales: 'no', field: 'no', tailor: 'no' },
  // المكتبة تحكم السعر والتكلفة معًا، فتعديلها بيد من يملك القرار المالي
  manage_fabrics: { admin: 'yes', sales: 'no', field: 'no', tailor: 'no' },
  // الخياط مسؤول القماش: يطلب بضاعته ويضيفها إلى مخزونه بنفسه، والأدمن
  // يتابع لا يوافق (قرار المالك 11.8.2026)
  receive_own_fabric: { admin: 'yes', sales: 'no', field: 'no', tailor: 'yes' },
  view_reports: { admin: 'yes', sales: 'limited', field: 'no', tailor: 'no' },
  create_quotation: { admin: 'yes', sales: 'yes', field: 'no', tailor: 'no' },
  install: { admin: 'yes', sales: 'no', field: 'yes', tailor: 'no' },
};

export function levelOf(role: Role, capability: Capability): Level {
  return MATRIX[capability][role];
}

export function can(role: Role, capability: Capability): boolean {
  const level = levelOf(role, capability);
  return level === 'yes' || level === 'limited';
}

export function canFully(role: Role, capability: Capability): boolean {
  return levelOf(role, capability) === 'yes';
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_cost_and_margin: 'مشاهدة تكلفة الجملة والربح',
  edit_pricing_rules: 'تعديل قواعد التسعير',
  manage_customers: 'إنشاء وتعديل زبون',
  enter_measurements: 'إدخال القياسات',
  reserve_fabric: 'حجز القماش',
  update_production: 'تحديث الإنتاج',
  record_payment: 'تسجيل دفعة',
  approve_discount: 'اعتماد خصم استثنائي',
  manage_users: 'إدارة المستخدمين',
  manage_fabrics: 'إدارة مكتبة الأقمشة',
  receive_own_fabric: 'إضافة بضاعة إلى مخزونه',
  view_reports: 'التقارير',
  create_quotation: 'إنشاء عرض سعر',
  install: 'التركيب الميداني',
};

export const LEVEL_LABELS: Record<Level, string> = {
  yes: 'نعم',
  limited: 'حسب الصلاحية',
  read: 'قراءة',
  no: 'لا',
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'الأدمن',
  sales: 'المبيعات',
  field: 'العامل الميداني',
  tailor: 'الخياط',
};

/** Financial figures are stripped from payloads for these roles, not just hidden. */
export function isFinanciallyBlind(role: Role): boolean {
  return role === 'field' || role === 'tailor';
}
