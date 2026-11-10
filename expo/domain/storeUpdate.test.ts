/**
 * «يتوفر تحديث»: الإلزاميّ والاختياريّ، والشكّ لا يمنع أحدًا.
 */
import { expect, test } from 'bun:test';

import { decideUpdate, parseBuild, storeLinks } from './storeUpdate';

const policy = (latestBuild: number, minBuild: number) => ({ latestBuild, minBuild, iosAppStoreId: null });

test('رقم البناء: عددٌ صحيح موجب وإلا فلا قرار', () => {
  expect(parseBuild('12')).toBe(12);
  expect(parseBuild(7)).toBe(7);
  for (const bad of [null, undefined, '', 'abc', '1.0.0', 0, -3, 2.5]) expect(parseBuild(bad)).toBeNull();
});

test('الشكّ لا يمنع أحدًا: لا رقم، لا سياسة، أصفار', () => {
  expect(decideUpdate({ installed: null, policy: policy(9, 9) }).kind).toBe('none');
  expect(decideUpdate({ installed: 3, policy: null }).kind).toBe('none');
  expect(decideUpdate({ installed: 3, policy: policy(0, 0) }).kind).toBe('none');
});

test('دون الحدّ الأدنى → إلزاميّ، ولا يُغلق ولو أُغلق شريطه سابقًا', () => {
  const d = decideUpdate({ installed: 5, policy: policy(12, 10), dismissedTarget: 99 });
  expect(d).toEqual({ kind: 'required', target: 12 });
});

test('دون الأحدث وفوق الأدنى → اختياريّ، يُغلق مرّةً لكلّ نسخة', () => {
  expect(decideUpdate({ installed: 11, policy: policy(12, 10) })).toEqual({ kind: 'optional', target: 12 });
  expect(decideUpdate({ installed: 11, policy: policy(12, 10), dismissedTarget: 12 }).kind).toBe('none');
  // نسخةٌ أحدث بعد الإغلاق تعود فتُعرض
  expect(decideUpdate({ installed: 11, policy: policy(13, 10), dismissedTarget: 12 })).toEqual({ kind: 'optional', target: 13 });
});

test('المحدَّث لا يرى شيئًا، والمتجر وحده يكفي لإعلان الاختياريّ', () => {
  expect(decideUpdate({ installed: 12, policy: policy(12, 10) }).kind).toBe('none');
  expect(decideUpdate({ installed: 12, policy: policy(12, 10), storeHasNewer: true })).toEqual({ kind: 'optional', target: 13 });
});

test('روابط المتجر: صفحة التطبيق نفسه، وiOS يحتاج معرّفًا صحيحًا', () => {
  expect(storeLinks('android', null)[0]).toBe('market://details?id=com.betakd.app');
  expect(storeLinks('ios', '1234567890')[0]).toBe('itms-apps://apps.apple.com/app/id1234567890');
  expect(storeLinks('ios', null)).toEqual([]);
  expect(storeLinks('ios', 'abc')).toEqual([]);
});
