/**
 * وثيقة عرض السعر - الحقيقة الوحيدة لما يستلمه الزبون.
 *
 * ثمانية قوالب على أسس التصميم التجاريّ المحترف (انظر quoteThemes.ts):
 * لونٌ واحد باعتدال، الإجمالي أكبرُ رقمٍ في الورقة، خطوطٌ شعريّة لا صناديق،
 * وإيماءةٌ واحدة تصنع شخصيّة كلّ قالب.
 *
 * لا react-native هنا ولا في شيءٍ يستورده - يعمل تحت `bun test` مباشرةً.
 */
import { CAIRO_BOLD_B64, CAIRO_REGULAR_B64 } from '@/constants/cairoFont';
import { HEEBO_BOLD_B64, HEEBO_REGULAR_B64 } from '@/constants/heeboFont';
import { translateTerm } from '@/domain/quoteGlossary';
import { layoutCss } from '@/domain/quoteLayoutCss';
import { HEADERS, type LayoutContext } from '@/domain/quoteLayouts';
import { quoteLogoSvg } from '@/domain/quoteLogo';
import { BRAND_WORDMARK, QUOTE_STRINGS, type QuoteLang } from '@/domain/quoteStrings';
import {
  DEFAULT_TEMPLATE,
  QUOTE_THEMES,
  type QuoteTemplate,
  type QuoteTheme,
} from '@/domain/quoteThemes';
import { formatDate, money } from '@/lib/format';
import type { QuotationVersion } from '@/types/domain';

/**
 * ★ الهروب - أسماء الغرف والزبائن والملاحظات تُحقن في الوثيقة، واسمٌ فيه `<`
 * يبتلع بقيّتها لأن المتصفّح يقرؤه بداية وسم. الاقتباسان يُهرَّبان أيضًا:
 * النصّ قد يقع داخل سمة، وحينها يكسر الاقتباسُ السمةَ نفسها.
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
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  number: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  projectTitle: string;
  vatPercent: number;
  showVat: boolean;
  lang: QuoteLang;
  template?: QuoteTemplate;
}

/** كثافتان: `tight` تضغط الصفوف فتتّسع الصفحة لبنودٍ أكثر. */
function metrics(theme: QuoteTheme) {
  const tight = theme.density === 'tight';
  return {
    base: tight ? 10.5 : 11.5,
    cellY: tight ? 7 : 12,
    gap: tight ? 12 : 20,
  };
}

function themeVars(theme: QuoteTheme): string {
  const m = metrics(theme);
  return `
    --accent: ${theme.accent};
    --accent-deep: ${theme.accentDeep};
    --accent-soft: ${theme.accentSoft};
    ${theme.second ? `--second: ${theme.second};` : ''}
    --ink: ${theme.ink};
    --ink-muted: ${theme.inkMuted};
    --line: ${theme.line};
    --paper: ${theme.paper};
    --on-accent: ${theme.onAccent};
    --radius: ${theme.radius}px;
    --brand-scale: ${theme.brandScale};
    --base: ${m.base}px;
    --cell-y: ${m.cellY}px;
    --gap: ${m.gap}px;`;
}

export function buildQuoteHtml(data: QuoteDocData): string {
  const {
    version, orgName, orgAddress, orgPhone, number, customerName, customerPhone,
    customerCity, projectTitle, vatPercent, showVat, lang,
  } = data;
  const theme = QUOTE_THEMES[data.template ?? DEFAULT_TEMPLATE];
  const t = QUOTE_STRINGS[lang];
  const isHe = lang === 'he';
  const e = escapeHtml;
  /** المفردات التي يولّدها التطبيق تُترجم؛ وما لا يعرفه المعجم يمرّ كما هو. */
  const tr = (v: string) => translateTerm(v, lang);

  /**
   * ★ الخطّان معًا في كلّ وثيقة: لغةُ الوثيقة تحكم التسميات، والبيانات تخرج
   * كما أدخلها المحلّ - فوثيقةٌ عبرية تحمل أسماء غرفٍ عربية. قِيس أن العربية
   * داخل وثيقةٍ عبرية كانت تسقط إلى خطٍّ احتياطيّ (فارقها عن خطٍّ غير موجود
   * 0.06%)؛ وبسلسلة Doc/DocAlt صارت تفترق عنه 21.7% - أي تستعمل المضمَّن.
   */
  const [REG, BOLD] = isHe
    ? [HEEBO_REGULAR_B64, HEEBO_BOLD_B64]
    : [CAIRO_REGULAR_B64, CAIRO_BOLD_B64];
  const [ALT_REG, ALT_BOLD] = isHe
    ? [CAIRO_REGULAR_B64, CAIRO_BOLD_B64]
    : [HEEBO_REGULAR_B64, HEEBO_BOLD_B64];

  const totalMeters =
    Math.round(version.items.reduce((s, i) => s + i.runningMeters, 0) * 1000) / 1000;
  const revExVat = version.totalAgorot - version.vatAgorot;
  // المرساة: السعر المُضخَّم حيث وُجد وإلا الحقيقي - يُقابله النهائي فيخرج «وفرت»
  const anchorSubtotal = version.items.reduce(
    (a, i) => a + Math.max(i.listPriceAgorot, i.lineTotalAgorot),
    0,
  );
  const saved = anchorSubtotal - revExVat;

  /**
   * خمسة أعمدة: الوصف تحت اسم البند والأمتار تحت القياس - سبعة أعمدة على A4
   * عربية تسحق عمودي السعر. وصنف القماش من تسمياته ثنائية اللغة الجاهزة.
   */
  const rows = version.items
    .map((i, idx) => {
      const cat = t.category[i.category] ?? '';
      const desc = i.description ? e(i.description) : '';
      const sub = [cat, desc].filter(Boolean).join(' • ');
      return `
      <tr>
        <td class="idx num">${idx + 1}</td>
        <td>
          <span class="item-name">${e(tr(i.roomName))} - ${e(tr(i.windowName))}</span>
          ${sub ? `<span class="item-desc">${sub}</span>` : ''}
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
      </tr>`;
    })
    .join('');

  const contact = [e(tr(orgAddress)), e(orgPhone)].filter(Boolean).join(' • ');

  const metaHtml = `<span class="meta">${t.version} ${version.versionNumber} • ${t.issuedOn}: ${formatDate(version.createdAt)}<br/><b>${t.validUntil}: ${formatDate(version.validUntil)}</b></span>`;

  const ctx: LayoutContext = {
    brandName: BRAND_WORDMARK,
    orgLine: [e(tr(orgName)), contact].filter(Boolean).join(' — '),
    logo: (size) => quoteLogoSvg(size),
    quoteLabel: t.quote,
    number: e(number),
    metaHtml,
    theme,
  };
  const header = HEADERS[theme.layout](ctx);

  /**
   * الإجمالي بطلُ الورقة - أكبرُ رقمٍ فيها، بمعالجتين:
   * `block` كتلةٌ مصمتة بلون القائد، و`type` طباعةٌ كبيرة فوق خطٍّ حازم.
   */
  const grandLabel = showVat ? t.grandInclVat : t.grand;
  const grandValue = showVat ? version.totalAgorot : revExVat;
  const grandHtml = `<div class="grand grand-${theme.totalStyle}"><span class="label">${grandLabel}</span><span class="value num">${money(grandValue)}</span></div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="${lang}">
<head>
<meta charset="utf-8" />
<style>
  /* ★ حجم الورقة صريح: بلا size تُطبع على US Letter فيُقصّ الهامش. والهامش
     الأفقيّ صفر كي تمتدّ ألوان الرأس إلى الحافّة - الحشوة يتولّاها المتن.
     و«first:» يُصفّر هامش الصفحة الأولى وحدها فيلامس الرأسُ حافّةَ الورقة. */
  @page { size: A4; margin: 12mm 0; }
  @page :first { margin-top: 0; }

  @font-face { font-family:'Doc'; font-weight:400; font-display:block;
    src:url(data:font/woff2;base64,${REG}) format('woff2'); }
  @font-face { font-family:'Doc'; font-weight:700; font-display:block;
    src:url(data:font/woff2;base64,${BOLD}) format('woff2'); }
  /* خطّ اللغة الأخرى: وثيقةٌ عبرية تحمل أسماء غرفٍ عربية - بلا هذا تسقط
     إلى خطٍّ لا ضمانةَ لوجوده في WebView الطباعة على الهاتف. */
  @font-face { font-family:'DocAlt'; font-weight:400; font-display:block;
    src:url(data:font/woff2;base64,${ALT_REG}) format('woff2'); }
  @font-face { font-family:'DocAlt'; font-weight:700; font-display:block;
    src:url(data:font/woff2;base64,${ALT_BOLD}) format('woff2'); }

  :root {${themeVars(theme)}
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* ★ الألوان تُطبع كما تُرى: كروم يُسقط الخلفيّات المساحيّة افتراضيًّا في
     الطباعة - فتخرج الرؤوس والكتل بيضاء على بيضاء. */
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Doc', 'DocAlt', "Helvetica Neue", Arial, sans-serif;
    direction: rtl; text-align: right; color: var(--ink);
    background: var(--paper); -webkit-font-smoothing: antialiased;
    font-size: var(--base); line-height: 1.55; }
  .num { font-variant-numeric: tabular-nums; }

  main { padding: 0 14mm; }

  /* ───────── شريط الزبون والمشروع: تسمياتٌ فوق قيم، بلا صناديق ───────── */
  .info { display: flex; gap: 26px; margin-top: var(--gap);
    padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .info > div { flex: 1; min-width: 0; }
  .info h5 { font-size: calc(var(--base) * .76); color: var(--ink-muted);
    font-weight: 700; letter-spacing: .5px; margin-bottom: 3px; }
  .info .v { font-size: calc(var(--base) * 1.08); font-weight: 700; color: var(--ink);
    overflow-wrap: break-word; }
  .info .s { font-size: calc(var(--base) * .86); color: var(--ink-muted); margin-top: 1px; }

  /* ───────── الجدول: صفوفٌ سخيّة وخطوطٌ شعريّة ───────── */
  table { width: 100%; table-layout: fixed; border-collapse: collapse;
    margin-top: var(--gap); }
  col.c-idx { width: 6%; } col.c-item { width: 39%; } col.c-size { width: 18%; }
  col.c-unit { width: 16%; } col.c-total { width: 21%; }
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  thead th { font-size: calc(var(--base) * .78); font-weight: 700;
    color: var(--ink-muted); letter-spacing: .5px; text-align: right;
    padding: 8px; }
  .th-rule thead th { border-bottom: 2px solid var(--accent); }
  .th-fill thead th { background: var(--accent-soft); color: var(--accent-deep); }
  td { padding: var(--cell-y) 8px; font-size: calc(var(--base) * .96);
    border-bottom: 1px solid var(--line); vertical-align: top;
    word-wrap: break-word; overflow-wrap: break-word; }
  .zebra tbody tr:nth-child(even) td { background: var(--accent-soft); }
  td.idx { color: var(--ink-muted); font-weight: 700; }
  .item-name { display: block; font-weight: 700; color: var(--ink); }
  .item-desc { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .84);
    margin-top: 2px; line-height: 1.5; }
  .size { display: block; }
  .size-sub { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .84);
    margin-top: 2px; }
  td.total .now { display: block; font-weight: 700; color: var(--ink);
    font-size: calc(var(--base) * 1.02); }
  .was { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .88);
    text-decoration: line-through; text-decoration-thickness: 1.2px;
    margin-bottom: 1px; }

  /* ───────── المجاميع: صفوفٌ هادئة ثم الإجمالي بطلًا ───────── */
  .totals { margin-top: var(--gap); margin-inline-start: auto; width: 88mm;
    break-inside: avoid; page-break-inside: avoid; }
  .totals .r { display: flex; justify-content: space-between; padding: 5px 2px;
    font-size: calc(var(--base) * .94); color: var(--ink); }
  .totals .r + .r { border-top: 1px solid var(--line); }
  .totals .r .strike { color: var(--ink-muted); text-decoration: line-through;
    text-decoration-thickness: 1.2px; }
  .totals .save { color: #067A5B; font-weight: 700; }

  /* الإجمالي بطل الورقة - أكبر رقمٍ فيها */
  .grand { display: flex; justify-content: space-between; align-items: center;
    margin-top: 8px; break-inside: avoid; }
  .grand .label { font-weight: 700; font-size: calc(var(--base) * 1.02); }
  .grand .value { font-weight: 700; }
  .grand-block { background: var(--accent); color: var(--on-accent);
    padding: 12px 16px; border-radius: var(--radius); }
  .grand-block .value { font-size: calc(var(--base) * 1.8);
    color: var(--second, var(--on-accent)); }
  .grand-type { border-top: 2px solid var(--accent); padding-top: 10px; }
  .grand-type .label { color: var(--ink); }
  .grand-type .value { font-size: calc(var(--base) * 2.1); color: var(--accent); }

  /* ───────── الذيل: هادئٌ وصغير ───────── */
  .foot { margin-top: calc(var(--gap) * 1.4); font-size: calc(var(--base) * .82);
    color: var(--ink-muted); line-height: 1.8;
    border-top: 1px solid var(--line); padding-top: 12px; break-inside: avoid; }
  .foot .note { color: var(--ink); font-weight: 700; margin-bottom: 4px; }
  .sign { display: flex; gap: 44px; margin-top: 18px; break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid var(--line); padding-top: 6px;
    font-size: calc(var(--base) * .8); }
  .thanks { color: var(--accent); font-weight: 700; margin-top: 8px; }

  /* ───────── هندسة الرأس ───────── */
${layoutCss(theme.layout)}
</style>
</head>
<body class="lay-${theme.layout} tpl-${theme.id} th-${theme.tableHead}${theme.zebra ? ' zebra' : ''}">
  ${header}

  <main>
    <section class="info">
      <div>
        <h5>${t.customer}</h5>
        <p class="v">${e(customerName)}</p>
        <p class="s">${e(customerPhone)}${customerCity ? ' • ' + e(tr(customerCity)) : ''}</p>
      </div>
      <div>
        <h5>${t.project}</h5>
        <p class="v">${e(tr(projectTitle))}</p>
        <p class="s">${t.itemsCount(version.items.length)} • ${totalMeters} ${t.metersUnit}</p>
      </div>
    </section>

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
      <div class="r"><span>${t.sumMeters}</span><span class="num">${totalMeters} ${t.metersUnit}</span></div>
      <div class="r"><span>${saved > 0 ? t.listTotal : t.subtotal}</span><span class="num ${
        saved > 0 ? 'strike' : ''
      }">${money(saved > 0 ? anchorSubtotal : version.subtotalAgorot)}</span></div>
      ${
        showVat
          ? `<div class="r"><span>${saved > 0 ? t.afterDiscount : t.subtotal}</span><span class="num">${money(revExVat)}</span></div>
      <div class="r"><span>${t.vat} ${vatPercent}%</span><span class="num">+ ${money(version.vatAgorot)}</span></div>`
          : ''
      }
      ${saved > 0 ? `<div class="r save"><span>${t.youSaved}</span><span class="num">${money(saved)}</span></div>` : ''}
      ${grandHtml}
    </div>

    <div class="foot">
      ${version.note ? `<div class="note">${t.note}: ${e(version.note)}</div>` : ''}
      ${t.terms}
      <div class="sign">
        <div>${t.customer}</div>
        <div>${BRAND_WORDMARK}</div>
      </div>
      <div class="thanks">${BRAND_WORDMARK} — ${t.thanks}</div>
    </div>
  </main>
</body>
</html>`;
}
