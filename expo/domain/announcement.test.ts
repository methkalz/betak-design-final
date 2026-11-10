/**
 * الإشعار العامّ: حدود النصّ نفسها التي يفرضها الخادم، وعدّ المستلمين بقاعدته.
 */
import { expect, test } from 'bun:test';

import { BODY_MAX, countRecipients, TITLE_MAX, validateAnnouncement } from './announcement';

test('الحدود: عنوانٌ من حرفين إلى 80، ونصٌّ حتى 500 - كالخادم', () => {
  expect(validateAnnouncement('', '')).not.toBeNull();
  expect(validateAnnouncement(' ع ', '')).not.toBeNull();
  expect(validateAnnouncement('إغلاق', '')).toBeNull();
  expect(validateAnnouncement('ع'.repeat(TITLE_MAX + 1), '')).not.toBeNull();
  expect(validateAnnouncement('عنوان', 'ن'.repeat(BODY_MAX))).toBeNull();
  expect(validateAnnouncement('عنوان', 'ن'.repeat(BODY_MAX + 1))).not.toBeNull();
});

test('المستلمون: الفاعلون في الأدوار المختارة، عدا المرسل والموقوف', () => {
  const people = [
    { id: 'a', role: 'admin' as const, isActive: true },
    { id: 'f1', role: 'field' as const, isActive: true },
    { id: 'f2', role: 'field' as const, isActive: false },
    { id: 't1', role: 'tailor' as const, isActive: true },
  ];
  expect(countRecipients(people, [], 'a')).toBe(2);
  expect(countRecipients(people, ['field'], 'a')).toBe(1);
  expect(countRecipients(people, ['admin'], 'a')).toBe(0);
  expect(countRecipients(people, ['field', 'tailor'], 'a')).toBe(2);
});
