/**
 * إعدادات الإشعارات: كلّ دورٍ يرى ما يصله، والقلب يحفظ ما تحفظه القاعدة.
 */
import { expect, test } from 'bun:test';

import { formatHour, KIND_INFO, kindsForRole, reminderHourOptions, toggleMuted } from './notificationPrefs';

test('كلّ نوعٍ يكتبه الخادم له مفتاحٌ عند دورٍ واحد على الأقلّ، ولكلّ مفتاحٍ اسمٌ ووصف', () => {
  const all = new Set(['admin', 'sales', 'field', 'tailor'].flatMap((r) => kindsForRole(r as never)));
  for (const k of Object.keys(KIND_INFO)) expect(all.has(k as never)).toBe(true);
  for (const info of Object.values(KIND_INFO)) {
    expect(info.label.length).toBeGreaterThan(0);
    expect(info.description.length).toBeGreaterThan(0);
  }
});

test('الخياط يرى ما يصله وحده - لا مخزون ولا خصومات', () => {
  expect(kindsForRole('tailor')).toEqual(['tailor_assignment', 'payment']);
  expect(kindsForRole('admin')).toContain('low_stock');
  expect(kindsForRole('field')).toContain('appointment_tomorrow');
  expect(kindsForRole(null)).toEqual([]);
});

test('القلب: يُطفئ ويُشغّل، بلا تكرار، مرتّبًا', () => {
  expect(toggleMuted([], 'payment')).toEqual(['payment']);
  expect(toggleMuted(['payment'], 'payment')).toEqual([]);
  expect(toggleMuted(['payment', 'low_stock'], 'discount_request')).toEqual(['discount_request', 'low_stock', 'payment']);
});

test('ساعات التذكير: المساء المعتاد، وما اختاره الأدمن خارجه يبقى ظاهرًا', () => {
  expect(reminderHourOptions(18)).toContain(18);
  expect(reminderHourOptions(8)[0]).toBe(8);
  expect(formatHour(8)).toBe('08:00');
  expect(formatHour(20)).toBe('20:00');
});
