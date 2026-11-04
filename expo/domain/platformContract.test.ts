/**
 * عقد المنصّة - حرّاسٌ على ما تكشفه الترقيات ولا تكشفه الاختبارات.
 *
 * وُلد من ترقية SDK 54 ← 57: كسرٌ منها كان **صامتًا تمامًا** - يمرّ من
 * الاختبارات ومن بوّابة الأنواع القديمة، ويظهر فقط على الشاشة بعد النشر.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * ★ العطب الذي أمسكه TypeScript 6 وحده.
 *
 * `StyleSheet.absoluteFillObject` أُزيلت من RN 0.86 **من وقت التشغيل لا من
 * الأنواع فقط**. ونحن ننشرها بالنقاط الثلاث:
 *
 *     backdrop: { ...StyleSheet.absoluteFillObject, ... }
 *
 * فنشرُ `undefined` لا يرمي - يُنتج كائنًا بلا تموضعٍ مطلق. النتيجة أن كل
 * طبقةٍ وخلفيّةٍ في التطبيق (الأوراق، الحُجُب، زجاج الشريط الجانبي) تفقد
 * تمدّدها **بصمت**: لا خطأ، لا اختبارٌ يسقط، فقط شاشةٌ مكسورة.
 */
test('★ لا StyleSheet.absoluteFillObject - أُزيلت من وقت التشغيل في RN 0.86', () => {
  const files = [
    'app/(tabs)/home.tsx', 'app/project/[id].tsx',
    'components/DateTimeSheet.tsx', 'components/DesktopShell.tsx', 'components/ui.tsx',
  ];
  for (const f of files) {
    expect(read(f)).not.toContain('absoluteFillObject');
  }
});

/**
 * ★ تسرّب ذاكرة Hermes v1 مع worklets/reanimated - ونستعمل الاثنين.
 * عطبٌ حقيقيّ في SDK 56، أُصلح في expo 57.0.17. النزول تحته يُعيده.
 */
test('★ expo ≥ 57.0.17 - تحتها تسرّبُ ذاكرةٍ مع worklets', () => {
  const pkg = JSON.parse(read('package.json'));
  const range: string = pkg.dependencies.expo;
  const m = range.match(/(\d+)\.(\d+)\.(\d+)/);
  expect(m).not.toBeNull();
  const [, a, b, c] = m!.map(Number);
  expect([a, b, c] >= [57, 0, 17] ? 1 : 0).toBe(1);
  // ومدى مثبَّت لا فضفاض: ^57 يسمح بأيّ 57.x بما فيها ما دون الإصلاح
  expect(range.startsWith('^')).toBe(false);
  // والحزمتان المعنيّتان حاضرتان فعلًا - وإلا فالحارس بلا موضوع
  expect(pkg.dependencies['react-native-worklets']).toBeTruthy();
  expect(pkg.dependencies['react-native-reanimated']).toBeTruthy();
});

/**
 * ★ سياسة runtimeVersion تحكم مَن يعمل: Expo Go أم الحارس الأقوى.
 *
 * `appVersion` تُنتج «1.0.0»، و**Expo Go يرفض أيّ runtime لا يبدأ بـ
 * `exposdk:`** - فتظهر «there was a problem running the requested project»
 * بلا سطرٍ واحد في سجلّ الخادم (البناء ينجح، والرفض عند العميل).
 *
 * `sdkVersion` تُنتج `exposdk:<SDK>.0.0` (اليوم 58) فيقبلها Expo Go، وتبقى حارسًا: تحديثٌ
 * لاسلكيّ لا يعبر حدّ إصدار SDK.
 *
 * **والمقايضة صريحة**: الحارس صار على مستوى SDK لا على مستوى الإصدار. إضافةُ
 * حزمةٍ أصليّة **داخل** الإصدار نفسه من SDK لا تُبدّل الـruntime، فقد يهبط تحديثٌ على
 * بناءٍ يفتقر إليها. اليوم لا ضرر - **لا بناءَ واحدًا موجودًا**. وقبل أوّل
 * توزيعٍ حقيقيّ تُبدَّل إلى `fingerprint`: تجزّئ التبعيّات الأصليّة فتمسك
 * هذا بالضبط، وتُغلق Expo Go عندئذٍ - وهو مقبولٌ حينها لأن الطاقم سيحمل
 * بناءً حقيقيًّا لا Expo Go.
 */
test('★ runtimeVersion بسياسة يقبلها Expo Go', () => {
  const rv = JSON.parse(read('app.json')).expo.runtimeVersion;
  expect(rv).toEqual({ policy: 'sdkVersion' });
});

/** `eas update` يلزمه `--environment` منذ SDK 55، وإلا فشل أمرُ النشر. */
test('أوامر التحديث اللاسلكيّ تحمل --environment', () => {
  const s = JSON.parse(read('package.json')).scripts;
  for (const k of ['update:preview', 'update:prod']) {
    expect(s[k]).toContain('--environment');
  }
});

/** شاشة البداية انتقلت إلى ملحقها في SDK الحديث - لا تُحذف مع الحقل القديم. */
test('شاشة البداية باقيةٌ في ملحقها لا مفقودة', () => {
  const app = JSON.parse(read('app.json')).expo;
  expect(app.splash).toBeUndefined();
  const plugin = (app.plugins as unknown[]).find(
    (p): p is [string, Record<string, string>] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  expect(plugin).toBeDefined();
  expect(plugin![1].image).toContain('splash-icon');
});

/** العمارة الجديدة إلزاميّة منذ SDK 55 - والخيار أُزيل من المخطّط. */
test('newArchEnabled محذوف - الخيار لم يعد في مخطّط الإعدادات', () => {
  expect(JSON.parse(read('app.json')).expo.newArchEnabled).toBeUndefined();
});

/** سقالة Rork أُسقطت - وMetro كان يلفّها في جذر المشروع لا في المصدر. */
test('لا أثرَ لسقالة Rork في إعداد البناء', () => {
  // على الاستيراد لا ورود الكلمة: التعليق في الملفّ يشرح لماذا أُسقطت،
  // واختبارٌ يرصد النصّ يسقط على توثيقٍ صحيح.
  expect(read('metro.config.js')).not.toMatch(/require\(['"][^'"]*rork/);
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.dependencies['@rork-ai/toolkit-sdk']).toBeUndefined();
  for (const k of ['start', 'start-web']) {
    expect(pkg.scripts[k]).not.toContain('rork');
  }
});

/**
 * ★ إشعارات الهاتف: أربع حلقاتٍ لو سقطت إحداها صمت الهاتف بلا خطأ.
 *
 * الحزمة ومُلحقها (أيقونة أندرويد البيضاء - بدونها مربّعٌ أبيض في شريط
 * الحالة)، والجسر مركَّبٌ في الجذر، والخروج يلغي الجهاز **قبل** إغلاق
 * الجلسة - بعدها يفقد الإلغاء هويّة صاحبه فيرنّ الهاتف لمن خرج منه.
 */
test('★ إشعارات الهاتف موصولةٌ من الحزمة إلى الخروج', () => {
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.dependencies['expo-notifications']).toBeTruthy();

  const app = JSON.parse(read('app.json')).expo;
  const plugin = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
  expect(plugin).toBeTruthy();
  expect(() => readFileSync(join(ROOT, plugin[1].icon))).not.toThrow();
  // الرمز يُطلب بمعرّف المشروع - بدونه لا رمز إطلاقًا
  expect(app.extra.eas.projectId).toBeTruthy();

  expect(read('app/_layout.tsx')).toMatch(/<PushBridge\s*\/>/);

  const store = read('providers/store.tsx');
  const signOut = store.slice(store.indexOf('const signOut = useCallback'));
  const unreg = signOut.indexOf('unregisterPushBestEffort()');
  const close = signOut.indexOf('supabase.auth.signOut()');
  expect(unreg).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(unreg);
});

/**
 * ★ Expo Go من المتجر يفتح أحدث SDK وحده.
 *
 * في 1.11.2026 ردّ Expo Go على الآيفون بـ404: أصدرت Expo SDK 58 في 15.10،
 * وExpo Go المحدَّث لا يطلب إلا `exposdk:58.0.0`، والتطبيق كان على 57. لا عطب
 * في الشيفرة ولا في الخادم: تحديثٌ منشور لم يعد يطابق ما يطلبه العميل.
 * أرضيّةٌ لا سقف - الترقية القادمة ترفعها.
 */
test('★ SDK 58 فما فوق - Expo Go في المتجر لا يفتح ما دونه', () => {
  const m = JSON.parse(read('package.json')).dependencies.expo.match(/(\d+)\./);
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeGreaterThanOrEqual(58);
});

/**
 * ★ SDK 58 غيّر افتراضين في الموجّه بلا خطأٍ يُرى.
 *
 * `web.output` بلا قيمة صار "server": HTML يُولَّد لكلّ طلب، ومحلّنا يُرفع
 * ملفّاتٍ ثابتة على استضافةٍ عادية. والتبويب الأوّل لم يعد خاصيّةً على <Tabs>
 * بل `unstable_settings.anchor` في التخطيط - بدونه يختار الموجّه البداية وحده.
 */
test('★ الموجّه: الويب ملفّاتٌ ثابتة، والتبويب الأوّل «الرئيسية»', () => {
  expect(JSON.parse(read('app.json')).expo.web.output).toBe('single');
  expect(read('app/(tabs)/_layout.tsx')).toMatch(/unstable_settings\s*=\s*\{\s*anchor:\s*'home'\s*\}/);
});

/**
 * ★ إشعارات أندرويد تمرّ عبر Firebase (FCM)، وملفّ إعداده في المستودع لأن
 * EAS Build يقرأ الملفّات منه. رقم الحزمة فيه يجب أن يكون رقم التطبيق نفسه:
 * ملفٌّ لتطبيقٍ آخر يُبنى بلا خطأ، ثم لا يصل الهاتف إشعارٌ واحد.
 */
test('★ ملفّ Firebase للأندرويد يطابق هويّة التطبيق', () => {
  const android = JSON.parse(read('app.json')).expo.android;
  const gs = JSON.parse(read(android.googleServicesFile));
  expect(gs.project_info.project_id).toBe('betak-design');
  const pkgs = gs.client.map(
    (c: { client_info: { android_client_info: { package_name: string } } }) =>
      c.client_info.android_client_info.package_name,
  );
  expect(pkgs).toContain(android.package);
});
