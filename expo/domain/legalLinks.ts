/**
 * صفحات المتجر على betakd.com - صفحاتٌ ثابتة نشرتها جلسة Ralabase (11.11.2026).
 *
 * Google Play تشترط رابط سياسة الخصوصية **داخل التطبيق** لا في صفحة المتجر
 * وحدها، وApple (5.1.1 v) تشترط طريقًا لحذف الحساب من داخله، لأن التطبيق ينشئ
 * حسابات. فالروابط هنا في شاشة «المزيد».
 */
export const SITE = 'https://betakd.com';

export interface LegalLink {
  key: 'privacy' | 'terms' | 'support' | 'delete-account';
  label: string;
  hint: string;
  url: string;
  danger?: boolean;
}

export const LEGAL_LINKS: LegalLink[] = [
  { key: 'privacy', label: 'سياسة الخصوصية', hint: 'ما نجمعه من بيانات وكيف نحميها', url: `${SITE}/privacy/` },
  { key: 'terms', label: 'شروط الاستخدام', hint: 'شروط استعمال التطبيق', url: `${SITE}/terms/` },
  { key: 'support', label: 'الدعم والمساعدة', hint: 'تواصل معنا', url: `${SITE}/support/` },
  {
    key: 'delete-account',
    label: 'طلب حذف الحساب',
    hint: 'حذف حسابك وبياناتك الشخصية',
    url: `${SITE}/delete-account/`,
    danger: true,
  },
];
