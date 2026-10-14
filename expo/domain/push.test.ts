/**
 * قواعد إشعارات الهاتف: الرمز الذي نرسله للخادم، والشاشة التي يفتحها اللمس.
 */
import { expect, test } from 'bun:test';

import { FALLBACK_ROUTE, isExpoPushToken, notificationRoute, unreadFor } from './push';

test('رمز Expo بصيغتيه يُقبل، وغيره يُرفض قبل أن يصل الخادم', () => {
  expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  expect(isExpoPushToken('ExpoPushToken[abc-123]')).toBe(true);
  for (const bad of ['', 'ExponentPushToken[]', 'ExponentPushToken[abc', 'abc', ' ExponentPushToken[a]', null, 42]) {
    expect(isExpoPushToken(bad)).toBe(false);
  }
});

test('كلّ رابطٍ تكتبه دوال القاعدة اليوم يفتح شاشته', () => {
  const id = '3f2b8c1e-9d4a-4e7b-8a6c-1b2c3d4e5f60';
  for (const link of [
    `/project/${id}`, `/visit/${id}`, `/tailor/${id}`, `/stock/${id}`, '/discounts', '/payments',
    // البيانات التجريبية تكتب روابط بمعرّفاتٍ نصّية
    '/roll/roll-cr102', '/tailor/ta-1042', '/visit/fv-1041-i',
  ]) {
    expect(notificationRoute(link)).toBe(link);
  }
});

test('رابطٌ غريب أو خارجيّ أو فارغ يذهب إلى قائمة الإشعارات - لا يضيع اللمس ولا يفتح شيئًا غريبًا', () => {
  for (const bad of [
    null, undefined, 42, '', 'project/x', 'https://evil.example', '//evil.example/x',
    'javascript:alert(1)', '/project/../settings', '/project/a b', '/project/x?y=1',
    '/settings', '/project/', '/stock/\\x',
  ]) {
    expect(notificationRoute(bad)).toBe(FALLBACK_ROUTE);
  }
});

test('رقم الأيقونة: غير المقروء لصاحبه وحده', () => {
  const list = [
    { userId: 'u1', readAt: null },
    { userId: 'u1', readAt: '2026-10-06T10:00:00Z' },
    { userId: 'u1', readAt: null },
    { userId: 'u2', readAt: null },
  ];
  expect(unreadFor(list, 'u1')).toBe(2);
  expect(unreadFor(list, 'u2')).toBe(1);
  expect(unreadFor(list, null)).toBe(0);
});
