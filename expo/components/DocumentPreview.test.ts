/**
 * معاينة الوثيقة - حارسٌ على أخطر ما في الشاشة: أن تكذب.
 *
 * كانت ترسم تقريبًا بمكوّنات RN لا الوثيقة نفسها، فيرى البائع شيئًا ويستلم
 * الزبون غيره. هذه الاختبارات تقفل أن المصدر واحد وأن الفصل بالمنصّة سليم.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dir;
const native = readFileSync(join(HERE, 'DocumentPreview.tsx'), 'utf8');
const web = readFileSync(join(HERE, 'DocumentPreview.web.tsx'), 'utf8');
const screen = readFileSync(join(HERE, '..', 'app', 'quotation', 'pdf.tsx'), 'utf8');

test('★ الشاشة تعرض الوثيقة نفسها - لا مسودّةً موازية', () => {
  expect(screen).toContain('<DocumentPreview html={html} />');
  // المسودّة القديمة رسمت بنودًا وسطر خصمٍ لا وجود له في الـPDF
  expect(screen).not.toContain('version.items.map');
  expect(screen).not.toContain('t.discount');
});

test('★ WebView لا تدخل حزمة الويب إطلاقًا - الفصل بالملفّ لا بحارس', () => {
  expect(native).toContain("from 'react-native-webview'");
  // على **الاستيراد** لا ورود الاسم: التعليق في النسخة الويبيّة يذكر الحزمة
  // شرحًا للقرار، واختبارٌ يرصد الكلمة يسقط على تعليقٍ صحيح.
  expect(web).not.toMatch(/^import .*react-native-webview/m);
  expect(web).toContain('<iframe');
});

test('حقن viewport للعرض وحده - لا يمسّ نصّ الطباعة', () => {
  // الوثيقة مصمَّمة على A4 ولا تحمل viewport: هذا صحيح لورقة طباعة
  expect(native).toContain('withPreviewViewport');
  // العرض مُدرَجٌ بالاستيفاء فلا يظهر حرفيًّا في المصدر - يُفحص الثابت وأثره
  expect(native).toContain('A4_WIDTH = 794');
  expect(native).toContain('name="viewport"');
  // ولا تُبدَّل الوثيقة قبل التصدير: exportHtmlDocument يأخذ html الأصلي
  expect(screen).toContain('exportHtmlDocument(html');
});

test('الويب يحجّم بالتحويل لا بتغيير عرض الوثيقة', () => {
  // تغيير العرض يُعيد تدفّق النصّ فتصير المعاينة كذبةً أخرى
  expect(web).toContain('transform: `scale(');
  expect(web).toContain('width: A4_WIDTH');
  // ولا يكبّر فوق المقاس الحقيقيّ
  expect(web).toContain('Math.min(1,');
});

test('الإرسال فعلٌ صريح لا أثرٌ جانبيّ للمعاينة', () => {
  expect(screen).toContain('label="إرسال للزبون"');
  expect(screen).toContain('label="تصدير PDF"');
});
