/**
 * أذونات التطبيق المبنيّ - حارسٌ على ما لا يُرى إلا بعد النشر.
 *
 * **لماذا هذا الملفّ موجود**: أذونات الأندرويد لا تأتي من `app.json` وحده.
 * كلّ حزمةٍ أصليّة تدمج مانيفستها في مانيفست التطبيق، فتُضاف أذونٌ لم يطلبها
 * أحد. قِيس في 23.8.2026: `react-native-maps` - المسحوبة **بالتبعية** عبر
 * `@rork-ai/toolkit-sdk` ولا يستوردها سطرٌ واحد - تدمج إذنَي الموقع،
 * و`expo-image-picker` تدمج إذن الميكروفون افتراضًا.
 *
 * فتطبيقُ محلّ ستائر كان سيطلب **الموقع الدقيق والميكروفون**. يستوقف مراجعة
 * المتجر، ويخيف الطاقم عند التثبيت، ولا يظهر في أيّ ملفٍّ يقرؤه أحد.
 *
 * `blockedPermissions` هي المخرج: تضع `tools:node="remove"` على السطر فيُسقطه
 * دامجُ المانيفست في Gradle - **ويُسقط معه مساهمات المكتبات** لا ما في
 * `app.json` فقط.
 *
 * هذا الاختبار يقفل النيّة. وللتحقّق من المانيفست النهائي فعلًا:
 * `bunx expo config --type introspect --json` ثمّ اقرأ `uses-permission`
 * (الخطوات في `ops/mobile-update.md`).
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'app.json'), 'utf8'),
).expo;

/** أذونٌ لا يستعملها سطرٌ واحد في التطبيق، وتُحقن بالتبعية. */
const MUST_BLOCK = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.RECORD_AUDIO',
];

test('أذون الموقع والميكروفون محجوبةٌ عن التطبيق المبنيّ', () => {
  const blocked: string[] = app.android?.blockedPermissions ?? [];
  for (const p of MUST_BLOCK) expect(blocked).toContain(p);
});

test('لا تكرار في قائمة الحجب - أدوات EAS تُلحق عند كلّ إعادة ضبط', () => {
  const blocked: string[] = app.android?.blockedPermissions ?? [];
  expect(blocked.length).toBe(new Set(blocked).size);
});

test('منتقي الصور لا يطلب ميكروفونًا: التطبيق يلتقط صورًا ساكنة لا فيديو', () => {
  const picker = (app.plugins as unknown[]).find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === 'expo-image-picker',
  );
  expect(picker).toBeDefined();
  expect(picker![1].microphonePermission).toBe(false);
});

test('قناة التحديث اللاسلكيّ موصولةٌ وهويّة التطبيق ليست سقالة Rork', () => {
  expect(app.updates?.url).toContain('u.expo.dev/');
  expect(app.runtimeVersion?.policy).toBe('appVersion');
  expect(app.extra?.eas?.projectId).toBeTruthy();

  for (const id of [app.android?.package, app.ios?.bundleIdentifier]) {
    expect(id).toBe('com.betakd.app');
    expect(id).not.toContain('rork');
  }
  expect(app.scheme).toBe('baytakdesign');
});
