/**
 * الإشعار العامّ - القواعد البحتة: الحدود، والجمهور، وعدّ المستلمين للمعاينة.
 *
 * الخادم (api.send_announcement) يفرض الحدود نفسها ويعدّ المستلمين بنفسه؛
 * هنا نعرضها قبل الإرسال كي لا يكتشف الأدمن الخطأ بعد الضغط.
 */
import type { Role } from '@/types/domain';

export const TITLE_MIN = 2;
export const TITLE_MAX = 80;
export const BODY_MAX = 500;

/** الأدوار التي يمكن استهدافها - الأدمن يرسل، فلا يستهدف الأدمن نفسه دورًا. */
export const AUDIENCE_ROLES: Role[] = ['field', 'tailor', 'sales', 'admin'];

export function validateAnnouncement(title: string, body: string): string | null {
  const t = title.trim();
  if (t.length < TITLE_MIN) return 'اكتب عنوانًا من حرفين على الأقل.';
  if (t.length > TITLE_MAX) return `العنوان ${TITLE_MAX} حرفًا على الأكثر.`;
  if (body.trim().length > BODY_MAX) return `النصّ ${BODY_MAX} حرف على الأكثر.`;
  return null;
}

/**
 * كم سيستلم: الأعضاء الفاعلون في الأدوار المختارة (لا أدوار = الجميع)، عدا
 * المرسل - بالقاعدة نفسها التي يعدّ بها الخادم.
 */
export function countRecipients(
  people: readonly { id: string; role: Role; isActive: boolean }[],
  roles: readonly Role[],
  senderId: string | null | undefined,
): number {
  return people.filter(
    (p) => p.isActive && p.id !== senderId && (roles.length === 0 || roles.includes(p.role)),
  ).length;
}
