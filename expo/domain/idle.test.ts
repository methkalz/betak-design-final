/**
 * حدّ الخمول على الأجهزة المشتركة. الحالتان الخطرتان مقفولتان هنا:
 * لسانٌ نائم لساعات (المؤقّت مخنوق فالقياس بالطابع)، وساعةٌ ترجع للخلف.
 */
import { expect, test } from 'bun:test';

import { IDLE_LIMIT_MS, idleRemainingMs, isIdleExpired } from '@/domain/idle';

const T0 = 1_700_000_000_000; // طابعٌ ثابت - لا Date.now في الاختبار
const MIN = 60_000;

test('الحدّ نصف ساعة، والانتهاء عنده لا بعده', () => {
  expect(IDLE_LIMIT_MS).toBe(30 * MIN);
  expect(isIdleExpired(T0, T0 + 30 * MIN - 1)).toBe(false);
  expect(isIdleExpired(T0, T0 + 30 * MIN)).toBe(true);
});

test('النشاط الحديث لا يُخرج', () => {
  for (const m of [0, 1, 10, 29]) {
    expect(isIdleExpired(T0, T0 + m * MIN)).toBe(false);
  }
});

test('لسانٌ نام ساعات: العودة تجد الجلسة منتهية', () => {
  // المتصفّح يخنق المؤقّتات في الخلفية، فالفحص عند العودة هو ما يُنقذ.
  for (const h of [1, 5, 24]) {
    expect(isIdleExpired(T0, T0 + h * 60 * MIN)).toBe(true);
  }
});

test('ساعةٌ رجعت للخلف لا تطرد مستخدمًا نشِطًا', () => {
  // مزامنةٌ زمنية أو تغيير المستخدم للتوقيت تجعل now < lastActivity.
  expect(isIdleExpired(T0, T0 - 5 * MIN)).toBe(false);
  expect(isIdleExpired(T0, T0 - 10 * 60 * MIN)).toBe(false);
});

test('المتبقّي يتناقص ويقف عند صفر، ولا يصير سالبًا', () => {
  expect(idleRemainingMs(T0, T0)).toBe(30 * MIN);
  expect(idleRemainingMs(T0, T0 + 10 * MIN)).toBe(20 * MIN);
  expect(idleRemainingMs(T0, T0 + 30 * MIN)).toBe(0);
  expect(idleRemainingMs(T0, T0 + 99 * MIN)).toBe(0);
});

test('المتبقّي صفرٌ بالضبط حين ينتهي الحدّ - الدالّتان متّسقتان', () => {
  const now = T0 + IDLE_LIMIT_MS;
  expect(isIdleExpired(T0, now)).toBe(true);
  expect(idleRemainingMs(T0, now)).toBe(0);
});

test('حدٌّ مخصَّص يُحترم - الرقم ليس مسمَّرًا في المنطق', () => {
  const five = 5 * MIN;
  expect(isIdleExpired(T0, T0 + 4 * MIN, five)).toBe(false);
  expect(isIdleExpired(T0, T0 + 5 * MIN, five)).toBe(true);
  expect(idleRemainingMs(T0, T0 + 2 * MIN, five)).toBe(3 * MIN);
});
