/**
 * وثيقة عرض السعر - الحقيقة الوحيدة لما يستلمه الزبون.
 *
 * كانت محبوسةً داخل ملفّ مسار (`app/quotation/pdf.tsx`) كدالّةٍ خاصّة، فلم يكن
 * لها اختبارٌ واحد رغم أنها **رأس حربة التطبيق**: الورقة التي يوقّعها الزبون.
 * وحدةٌ نقيّة هنا تعني أن كلّ حرفٍ فيها يصير قابلًا للفحص.
 *
 * لا react-native في هذا الملفّ ولا في شيءٍ يستورده - يعمل تحت `bun test`
 * مباشرةً كبقيّة `domain/`.
 */
import { CAIRO_BOLD_B64, CAIRO_REGULAR_B64 } from '@/constants/cairoFont';
import { HEEBO_BOLD_B64, HEEBO_REGULAR_B64 } from '@/constants/heeboFont';
import { BRAND_WORDMARK, QUOTE_STRINGS, type QuoteLang } from '@/domain/quoteStrings';
import { formatDate, money } from '@/lib/format';
import type { QuotationVersion } from '@/types/domain';

/**
 * ★ الهروب - عيبٌ كان قائمًا منذ أوّل نسخة.
 *
 * أسماء الغرف والشبابيك والزبائن والملاحظات تُحقن في الوثيقة نصًّا خامًّا.
 * فزبونٌ اسمه «محلّ الستائر & المفروشات» يخرج مشوَّهًا، واسمٌ فيه `<` **يبتلع
 * بقيّة الوثيقة** لأن المتصفّح يقرؤه بداية وسم. وملاحظةٌ فيها `<script>` تُنفَّذ
 * داخل إطار المعاينة.
 *
 * الاقتباس المفرد والمزدوج يُهرَّبان أيضًا: النصّ قد يقع داخل سمة (attribute)
 * في قالبٍ لاحق، وحينها يكسر الاقتباسُ السمةَ نفسها.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface QuoteDocData {
  version: QuotationVersion;
  orgPhone: string;
  number: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  projectTitle: string;
  vatPercent: number;
  showVat: boolean;
  lang: QuoteLang;
}

export function buildQuoteHtml(data: QuoteDocData): string {
  const {
    version, orgPhone, number, customerName, customerPhone, customerCity,
    projectTitle, vatPercent, showVat, lang,
  } = data;
  const t = QUOTE_STRINGS[lang];
  const isHe = lang === 'he';
  /**
   * ★ الخطّان معًا في كلّ وثيقة، لا خطّ اللغة وحده.
   *
   * لغةُ الوثيقة تحكم **التسميات** فقط؛ أمّا البيانات - أسماء الغرف والشبابيك
   * والزبون والملاحظة - فتخرج كما أدخلها المحلّ. فوثيقةٌ عبرية لزبونٍ عبريّ
   * تحمل «الصالون» و«الشباك الاول» بالعربية حتمًا.
   *
   * وقياسًا في المتصفّح: العربية داخل وثيقةٍ عبرية كانت **تسقط إلى خطٍّ
   * احتياطيّ** (عرضها يساوي عرضها بخطٍّ غير موجود بفارق 0.06%، بينما العبرية
   * تفترق عن الاحتياطيّ بـ21%). في المتصفّح يمرّ؛ وفي WebView الطباعة على
   * الهاتف لا ضمانةَ لخطٍّ عربيّ - فتخرج الأسماء بخطٍّ غريب أو مربّعات.
   *
   * الحلّ سلسلة: `'Doc'` لخطّ اللغة و`'DocAlt'` للأخرى. المتصفّح يسقط
   * **محرفًا محرفًا** لا وثيقةً كاملة، فكلّ نصٍّ يجد خطّه المضمَّن.
   */
  const [REG, BOLD] = isHe
    ? [HEEBO_REGULAR_B64, HEEBO_BOLD_B64]
    : [CAIRO_REGULAR_B64, CAIRO_BOLD_B64];
  const [ALT_REG, ALT_BOLD] = isHe
    ? [CAIRO_REGULAR_B64, CAIRO_BOLD_B64]
    : [HEEBO_REGULAR_B64, HEEBO_BOLD_B64];
  const e = escapeHtml;

  const totalMeters =
    Math.round(version.items.reduce((s, i) => s + i.runningMeters, 0) * 1000) / 1000;
  const revExVat = version.totalAgorot - version.vatAgorot;
  // المرساة: السعر المُضخَّم حيث وُجد وإلا الحقيقي - يُقابله النهائي فيخرج «وفّرت»
  const anchorSubtotal = version.items.reduce(
    (a, i) => a + Math.max(i.listPriceAgorot, i.lineTotalAgorot),
    0,
  );
  const saved = anchorSubtotal - revExVat;

  /**
   * خمسة أعمدة لا سبعة. الوصف انتقل تحت اسم البند والأمتار تحت القياس، وهو
   * ما تفعله شاشة العرض نفسها: سبعة أعمدة على A4 عربية تسحق عمودي السعر
   * وتجعل الوثيقة تُقرأ كجدول بيانات لا كعرض سعر.
   */
  const rows = version.items
    .map(
      (i, idx) => `
      <tr>
        <td class="idx num">${idx + 1}</td>
        <td>
          <span class="item-name">${e(i.roomName)} - ${e(i.windowName)}</span>
          ${i.description ? `<span class="item-desc">${e(i.description)}</span>` : ''}
        </td>
        <td class="num">
          <span class="size">${i.widthCm} × ${i.heightCm} ${t.sizeUnit}</span>
          <span class="size-sub">${i.runningMeters} ${t.metersUnit}</span>
        </td>
        <td class="num">${money(i.unitPriceAgorot)}</td>
        <td class="num total">${
          i.listPriceAgorot > i.lineTotalAgorot
            ? `<span class="was">${money(i.listPriceAgorot)}</span>`
            : ''
        }<span class="now">${money(i.lineTotalAgorot)}</span></td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="${lang}">
<head>
<meta charset="utf-8" />
<style>
  /* ★ حجم الورقة صريح: بلا هذا تُطبع على US Letter في الإعدادات الأمريكية
     فيُقصّ الهامش الأيمن من وثيقةٍ صُمّمت على A4. */
  @page { size: A4; }
  @font-face { font-family:'Doc'; font-weight:400; font-display:block;
    src:url(data:font/woff2;base64,${REG}) format('woff2'); }
  @font-face { font-family:'Doc'; font-weight:700; font-display:block;
    src:url(data:font/woff2;base64,${BOLD}) format('woff2'); }
  /* خطّ اللغة الأخرى: البيانات تخرج كما أدخلها المحلّ، فوثيقةٌ عبرية تحمل
     أسماء غرفٍ عربية. بلا هذا تسقط تلك الأسماء إلى خطٍّ احتياطيّ لا ضمانةَ
     لوجوده في WebView الطباعة على الهاتف. */
  @font-face { font-family:'DocAlt'; font-weight:400; font-display:block;
    src:url(data:font/woff2;base64,${ALT_REG}) format('woff2'); }
  @font-face { font-family:'DocAlt'; font-weight:700; font-display:block;
    src:url(data:font/woff2;base64,${ALT_BOLD}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Doc', 'DocAlt', "Helvetica Neue", Arial, sans-serif;
    direction: rtl; text-align: right; color: #1B1F32; padding: 32px 28px;
    background: #FFFFFF; -webkit-font-smoothing: antialiased; font-size: 12px; line-height: 1.5; }
  /* ★ الألوان تُطبع كما تُرى: بلا هذا يُسقط المتصفّح كلّ خلفيّةٍ مساحيّة حين
     تكون «رسوم الخلفية» مطفأة في حوار الطباعة - وهي مطفأةٌ افتراضيًّا في
     كروم. فتخرج رؤوس الجدول والشارة والصناديق **بيضاء على بيضاء**. */
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* أرقامٌ بعرضٍ واحد: بدونها لا تصطفّ خانات الأسعار تحت بعضها في العمود */
  .num, .totals .r, .grand, .brand-phone { font-variant-numeric: tabular-nums; }

  .head { display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 16px; margin-bottom: 18px;
    border-bottom: 2px solid #4F46E5; }
  .brand { font-size: 27px; font-weight: 700; color: #211D63; letter-spacing: .3px; line-height: 1.1; }
  .brand-sub { color: #4338CA; font-size: 12.5px; font-weight: 700; margin-top: 4px; }
  .brand-phone { color: #5C6280; font-size: 11.5px; margin-top: 2px; direction: ltr; text-align: right; }
  .badge { background: #4F46E5; color: #fff; padding: 6px 15px; border-radius: 999px;
    font-size: 12.5px; font-weight: 700; display: inline-block; }
  .meta { color: #5C6280; font-size: 11px; line-height: 1.8; margin-top: 7px; }
  .meta b { color: #211D63; }

  .grid { display: flex; gap: 12px; margin-bottom: 16px; }
  .box { flex: 1; background: #F6F6FB; border: 1px solid #E2E3F2; border-radius: 12px; padding: 12px 14px; }
  .box h3 { font-size: 10.5px; color: #5C6280; font-weight: 700; margin-bottom: 5px; letter-spacing: .3px; }
  .box .big { font-size: 14px; font-weight: 700; color: #211D63; }
  .box .muted { color: #5C6280; font-size: 11px; margin-top: 2px; }

  /* عرضٌ ثابت لكل عمود: بلا هذا يبتلع عمود الوصف الصفحة ويُسحق عمودا السعر */
  table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
    margin-top: 4px; border: 1px solid #E2E3F2; border-radius: 12px; overflow: hidden; }
  col.c-idx   { width: 6%; }
  col.c-item  { width: 39%; }
  col.c-size  { width: 18%; }
  col.c-unit  { width: 16%; }
  col.c-total { width: 21%; }
  /* الرأس يتكرر على كل صفحة، والبند لا ينشطر بين صفحتين */
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  thead th { background: #EEEFFE; color: #2E27A8; font-size: 10.5px; font-weight: 700;
    padding: 9px 8px; text-align: right; }
  td { padding: 9px 8px; font-size: 11.5px; border-top: 1px solid #EDEDF7;
    vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  tbody tr:first-child td { border-top: none; }
  tbody tr:nth-child(even) td { background: #FAFAFE; }
  td.idx { color: #767DA5; font-weight: 700; }
  .item-name { display: block; font-weight: 700; color: #211D63; }
  .item-desc { display: block; color: #5C6280; font-size: 10.5px; margin-top: 2px; line-height: 1.45; }
  .size      { display: block; color: #2C3150; }
  .size-sub  { display: block; color: #5C6280; font-size: 10.5px; margin-top: 2px; }
  td.total .now { display: block; font-weight: 700; color: #211D63; font-size: 12.5px; }

  /* السعر قبل الخصم. كان #A0A4BB وهو أفتح من أن يُقرأ مطبوعًا؛ الآن مقروء،
     والشطب وحده - بلونٍ دافئ - هو ما يقول إنه السعر القديم لا بهتان اللون. */
  .was { display: block; color: #6B7191; font-size: 11px; font-weight: 500;
    text-decoration: line-through; text-decoration-color: #E0796F;
    text-decoration-thickness: 1.4px; margin-bottom: 1px; }

  .totals { margin-top: 16px; margin-inline-start: auto; width: 300px;
    background: #F6F6FB; border: 1px solid #E2E3F2; border-radius: 12px; padding: 14px 16px;
    break-inside: avoid; page-break-inside: avoid; }
  .totals .r { display: flex; justify-content: space-between; padding: 4px 0;
    font-size: 12px; color: #3F4560; }
  /* «قبل الخصم» في صندوق المجاميع يُشطب كما يُشطب سعر البند - نفس اللغة البصرية */
  .totals .r .strike { color: #6B7191; text-decoration: line-through;
    text-decoration-color: #E0796F; text-decoration-thickness: 1.4px; }
  .totals .save { color: #067A5B; font-weight: 700;
    border-top: 1px dashed #C9CBE6; margin-top: 8px; padding-top: 8px; }
  .grand { display: flex; justify-content: space-between; align-items: baseline;
    border-top: 2px solid #4F46E5; margin-top: 9px; padding-top: 10px;
    font-size: 17px; font-weight: 700; color: #3B32C4; }
  .grand .label { font-size: 13px; color: #211D63; }

  .foot { margin-top: 20px; font-size: 10.5px; color: #5C6280; line-height: 1.75;
    border-top: 1px solid #E2E3F2; padding-top: 12px; break-inside: avoid; }
  .foot .note { color: #211D63; font-weight: 700; margin-bottom: 5px; }
  .thanks { color: #3B32C4; font-weight: 700; margin-top: 6px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">${BRAND_WORDMARK}</div>
      <div class="brand-sub">${t.city}</div>
      <div class="brand-phone">${e(orgPhone)}</div>
    </div>
    <div style="text-align:left">
      <div class="badge">${t.quote} ${e(number)}</div>
      <div class="meta">${t.version} ${version.versionNumber}<br/>${t.issuedOn}: ${formatDate(version.createdAt)}<br/><b>${t.validUntil}: ${formatDate(version.validUntil)}</b></div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>${t.customer}</h3>
      <div class="big">${e(customerName)}</div>
      <div class="muted">${e(customerPhone)}${customerCity ? ' • ' + e(customerCity) : ''}</div>
    </div>
    <div class="box">
      <h3>${t.project}</h3>
      <div class="big">${e(projectTitle)}</div>
      <div class="muted">${t.itemsCount(version.items.length)}</div>
    </div>
  </div>

  <table>
    <colgroup>
      <col class="c-idx" /><col class="c-item" /><col class="c-size" />
      <col class="c-unit" /><col class="c-total" />
    </colgroup>
    <thead>
      <tr>
        <th>${t.colIndex}</th><th>${t.colRoom}</th><th>${t.colSize}</th>
        <th>${t.colUnit}</th><th>${t.colTotal}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="r"><span>${t.sumMeters}</span><span>${totalMeters} ${t.metersUnit}</span></div>
    <div class="r"><span>${saved > 0 ? t.listTotal : t.subtotal}</span><span class="${
      saved > 0 ? 'strike' : ''
    }">${money(saved > 0 ? anchorSubtotal : version.subtotalAgorot)}</span></div>
    ${
      showVat
        ? `<div class="r"><span>${saved > 0 ? t.afterDiscount : t.subtotal}</span><span>${money(revExVat)}</span></div>
    <div class="r"><span>${t.vat} ${vatPercent}%</span><span>+ ${money(version.vatAgorot)}</span></div>
    <div class="grand"><span class="label">${t.grandInclVat}</span><span>${money(version.totalAgorot)}</span></div>`
        : `<div class="grand"><span class="label">${t.grand}</span><span>${money(revExVat)}</span></div>`
    }
    ${saved > 0 ? `<div class="r save"><span>${t.youSaved}</span><span>${money(saved)}</span></div>` : ''}
  </div>

  <div class="foot">
    ${version.note ? `<div class="note">${t.note}: ${e(version.note)}</div>` : ''}
    ${t.terms}
    <div class="thanks">${BRAND_WORDMARK} — ${t.thanks}</div>
  </div>
</body>
</html>`;
}
