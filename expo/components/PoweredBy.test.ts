/**
 * توقيع المزوّد - الحارسان اللذان لا يُرى كسرُهما بالعين.
 *
 * ‏١) **تطبيق المتجر لا يحمل توقيعًا خارجيًّا.** الحارس `Platform.OS !== 'web'`
 *    وليس عرضَ الشاشة: متصفّح الهاتف ويبٌ ويستحقّ التوقيع، والأصليّ لا -
 *    ولو قيس بالعرض لظهر التوقيع في التطبيق على جهازٍ لوحيّ.
 *
 * ‏٢) **الرابط يفتح نافذةً جديدة.** `Linking.openURL` على react-native-web
 *    يستعمل `_blank` مع `noopener` افتراضًا؛ هذا الاختبار يقرأ تلك الحقيقة من
 *    الحزمة نفسها لا من الذاكرة - فترقيةٌ تغيّر السلوك تُسقطه بدل أن تُخرج
 *    المستخدم من جلسته صامتةً.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `import.meta.dir` يعطي المسار الأصليّ للمنصّة - على ويندوز يتجنّب
// الشرطة البادئة التي يضيفها تحويل URL إلى مسار.
const HERE = import.meta.dir;
const src = readFileSync(join(HERE, 'PoweredBy.tsx'), 'utf8');

test('الحارس منصّةٌ لا عرض - فلا توقيع في تطبيق المتجر', () => {
  expect(src).toContain("Platform.OS !== 'web'");
  expect(src).toContain('return null');
  // لا يُقاس بالعرض إطلاقًا: متصفّح الهاتف ويبٌ أيضًا ويستحقّ التوقيع.
  // الفحص على الاستيراد لا على ورود الكلمة - فالتعليق يذكرها شرحًا للقرار.
  expect(src).not.toMatch(/^import .*useResponsive/m);
  expect(src).not.toMatch(/^import .*Dimensions/m);
});

test('الوجهة qinova.net على https، ولا رابطَ آخر في الملفّ', () => {
  const urls = src.match(/https?:\/\/[^\s'"]+/g) ?? [];
  expect(urls).toEqual(['https://qinova.net']);
});

test('حزمة الويب ما زالت تفتح _blank مع noopener', () => {
  const rnw = readFileSync(
    join(HERE, '..', 'node_modules', 'react-native-web', 'dist', 'exports', 'Linking', 'index.js'),
    'utf8',
  );
  expect(rnw).toContain("target = '_blank'");
  expect(rnw).toContain("'noopener'");
});
