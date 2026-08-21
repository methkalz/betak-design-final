/**
 * تجهيز وثيقة HTML للطباعة - منطقٌ نقيّ يُفحَص بالوحدة.
 *
 * عنوان المستند ليس تفصيلًا تجميليًّا: المتصفّح يستعمله **اسمًا افتراضيًّا
 * لملفّ PDF** في حوار «حفظ كـPDF». فبلا `<title>` يصل الزبونَ ملفٌّ اسمه
 * `localhost` بدل رقم المقترح واسمه.
 */

/** يحقن `<title>` بعد `<head>` إن لم يكن للوثيقة عنوانٌ أصلًا. */
export function withTitle(html: string, title: string): string {
  if (/<title[\s>]/i.test(html)) return html;
  const safe = title.replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1><title>${safe}</title>`);
}
