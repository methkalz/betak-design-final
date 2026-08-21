/**
 * تصدير وثيقة HTML إلى PDF - مسارٌ واحد للمنصّتين.
 *
 * **العطب الذي يعالجه**: كعب `expo-print` على الويب هو حرفيًّا
 * `async printToFileAsync() { window.print(); }` - يُعيد `undefined` **ويطبع
 * الصفحة الحالية**. فسطرٌ كـ`const { uri } = await Print.printToFileAsync(...)`
 * يرمي TypeError، والمتصفّح يفتح نافذة طباعةٍ فيها **واجهة التطبيق** بدل
 * المقترح. أي أن تصدير المقترح - رأس حربة التطبيق - كان ميتًا على الويب.
 *
 * الحلّ على الويب: تُرسَم الوثيقة في إطارٍ مخفيّ ويُطبع **هو**. فيحصل
 * المستخدم على PDF حقيقيّ عبر «حفظ كـPDF» في حوار الطباعة.
 *
 * على الأصليّ لا يتغيّر شيء: ملفٌّ حقيقيّ ثم ورقة المشاركة.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { withTitle } from '@/domain/htmlDoc';

export type ExportResult =
  /** أصليّ: أُنشئ الملفّ وفُتحت ورقة المشاركة. */
  | { kind: 'shared' }
  /** أصليّ: أُنشئ الملفّ ولا مشاركةَ متاحة. */
  | { kind: 'saved'; uri: string }
  /** ويب: فُتح حوار الطباعة على الوثيقة - ومنه «حفظ كـPDF». */
  | { kind: 'printed' };

/**
 * الطباعة على الويب عبر إطارٍ مخفيّ.
 *
 * ‏`srcdoc` لا `document.write`: يحفظ الوثيقة معزولةً عن أنماط التطبيق.
 * والانتظار على `fonts.ready` ضروريّ - الخطوط مضمَّنة base64 داخل الوثيقة،
 * فبلا انتظارٍ يُطبع النصّ العربي بخطّ احتياطيّ.
 */
function printViaIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = globalThis.document;
    if (!doc) {
      reject(new Error('no document'));
      return;
    }
    const frame = doc.createElement('iframe');
    // خارج التدفّق لا `display:none`: بعض المتصفّحات لا تطبع إطارًا مخفيًّا
    frame.setAttribute(
      'style',
      'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;',
    );
    frame.setAttribute('aria-hidden', 'true');
    frame.srcdoc = html;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      // مهلةٌ قبل الإزالة: إزالة الإطار أثناء الطباعة تُفرغ الحوار
      setTimeout(() => frame.remove(), 60_000);
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error('no contentWindow'));
        return;
      }
      const go = () => {
        try {
          win.focus();
          win.print();
          cleanup();
          resolve();
        } catch (e) {
          cleanup();
          reject(e as Error);
        }
      };
      // ننتظر الخطوط، وبمهلةٍ قصوى كي لا نعلق لو لم يُحسم الوعد
      const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) {
        let fired = false;
        const once = () => {
          if (fired) return;
          fired = true;
          go();
        };
        fonts.ready.then(once).catch(once);
        setTimeout(once, 3000);
      } else {
        setTimeout(go, 300);
      }
    };

    frame.onerror = () => {
      cleanup();
      reject(new Error('iframe failed'));
    };

    doc.body.appendChild(frame);
  });
}

/**
 * يُصدّر وثيقة HTML: ملفٌّ ومشاركة على الأصليّ، وحوار طباعة على الويب.
 *
 * @param html وثيقة كاملة (`<!DOCTYPE html>…`)
 * @param title اسم المستند - يصير اسم ملفّ PDF المقترح وعنوان ورقة المشاركة
 */
export async function exportHtmlDocument(html: string, title: string): Promise<ExportResult> {
  if (Platform.OS === 'web') {
    await printViaIframe(withTitle(html, title));
    return { kind: 'printed' };
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
      UTI: 'com.adobe.pdf',
    });
    return { kind: 'shared' };
  }
  return { kind: 'saved', uri };
}
