/**
 * وثيقة عرض السعر - الحقيقة الوحيدة لما يستلمه الزبون.
 *
 * كانت محبوسةً داخل ملفّ مسار كدالّةٍ خاصّة، فلم يكن لها اختبارٌ واحد رغم أنها
 * **رأس حربة التطبيق**: الورقة التي يوقّعها الزبون. وحدةٌ نقيّة هنا تعني أن
 * كلّ حرفٍ فيها صار قابلًا للفحص.
 *
 * **ثمانية قوالب من وثيقةٍ واحدة**: الاختلاف رموزٌ في `quoteThemes.ts` لا
 * شيفرة. ثلاثة هياكل بنيويّة (`letterhead` / `banner` / `edge`) × ألوانٍ
 * وكثافةٍ وسلّم طباعة. فإصلاحٌ واحد يسري على الثمانية، ولا تتباعد صيانةً.
 *
 * لا react-native هنا ولا في شيءٍ يستورده - يعمل تحت `bun test` مباشرةً.
 */
import { CAIRO_BOLD_B64, CAIRO_REGULAR_B64 } from '@/constants/cairoFont';
import { HEEBO_BOLD_B64, HEEBO_REGULAR_B64 } from '@/constants/heeboFont';
import { translateTerm } from '@/domain/quoteGlossary';
import { HEADERS, type LayoutContext } from '@/domain/quoteLayouts';
import { layoutCss } from '@/domain/quoteLayoutCss';
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
 * ★ الهروب - عيبٌ كان قائمًا منذ أوّل نسخة.
 *
 * أسماء الغرف والشبابيك والزبائن والملاحظات تُحقن في الوثيقة نصًّا خامًّا.
 * فزبونٌ اسمه «محلّ الستائر & المفروشات» يخرج مشوَّهًا، واسمٌ فيه `<` **يبتلع
 * بقيّة الوثيقة** لأن المتصفّح يقرؤه بداية وسم. وملاحظةٌ فيها `<script>` تُنفَّذ
 * داخل إطار المعاينة.
 *
 * الاقتباس المفرد والمزدوج يُهرَّبان أيضًا: النصّ قد يقع داخل سمة (attribute)،
 * وحينها يكسر الاقتباسُ السمةَ نفسها.
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

/** كثافتان: `tight` تضغط الحشوات فتتّسع الصفحة لبنودٍ أكثر. */
function metrics(theme: QuoteTheme) {
  const tight = theme.density === 'tight';
  return {
    base: tight ? 10.5 : 12,
    cell: tight ? '6px 7px' : '9px 8px',
    gap: tight ? 10 : 16,
    pad: tight ? 10 : 14,
  };
}

function themeVars(theme: QuoteTheme): string {
  const m = metrics(theme);
  return `
    --accent: ${theme.accent};
    --accent-deep: ${theme.accentDeep};
    --accent-soft: ${theme.accentSoft};
    --second: ${theme.second ?? theme.accent};
    --ink: ${theme.ink};
    --ink-muted: ${theme.inkMuted};
    --line: ${theme.line};
    --surface: ${theme.surface};
    --on-accent: ${theme.onAccent};
    --radius: ${theme.radius}px;
    --grid: ${theme.line};
    --brand-scale: ${theme.brandScale};
    --base: ${m.base}px;
    --cell: ${m.cell};
    --gap: ${m.gap}px;
    --pad: ${m.pad}px;`;
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
   * خمسة أعمدة لا سبعة. الوصف تحت اسم البند والأمتار تحت القياس: سبعة أعمدة
   * على A4 عربية تسحق عمودي السعر وتجعل الوثيقة تُقرأ كجدول بياناتٍ لا كعرض سعر.
   *
   * وصنف القماش يظهر لأوّل مرّة - تسمياته ثنائية اللغة كانت جاهزةً في
   * `QUOTE_STRINGS[lang].category` وغير مستعملة إطلاقًا.
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

  /**
   * ★ ثلاث طرقٍ لعرض البنود - لا جدولٌ واحدٌ بألوان.
   *
   * `cards` تكسر الجدول إلى بطاقاتٍ في عمودين: قراءةٌ مختلفة تمامًا، تليق
   * بعرضٍ قصيرٍ يُقرأ على مهل. و`ledger` تضغطه إلى دفترٍ نحيل لعرضٍ طويل.
   */
  const cardsHtml = version.items
    .map((i, idx) => {
      const cat = t.category[i.category] ?? '';
      return `
      <article class="qcard">
        <span class="qc-n">${idx + 1}</span>
        <h4>${e(tr(i.roomName))} - ${e(tr(i.windowName))}</h4>
        ${cat ? `<p class="qc-cat">${cat}</p>` : ''}
        ${i.description ? `<p class="qc-desc">${e(i.description)}</p>` : ''}
        <dl>
          <div><dt>${t.colSize}</dt><dd>${i.widthCm} × ${i.heightCm} ${t.sizeUnit}</dd></div>
          <div><dt>${t.metersUnit}</dt><dd>${i.runningMeters}</dd></div>
          <div><dt>${t.colUnit}</dt><dd>${money(i.unitPriceAgorot)}</dd></div>
        </dl>
        <div class="qc-total">${
          i.listPriceAgorot > i.lineTotalAgorot
            ? `<span class="was">${money(i.listPriceAgorot)}</span>`
            : ''
        }<b>${money(i.lineTotalAgorot)}</b></div>
      </article>`;
    })
    .join('');

  const tableHtml = `
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
    </table>`;

  const itemsHtml =
    theme.itemStyle === 'cards' ? `<div class="qcards">${cardsHtml}</div>` : tableHtml;


  const metaHtml = `<span class="meta">${t.version} ${version.versionNumber}<br/>${t.issuedOn}: ${formatDate(version.createdAt)}<br/><b>${t.validUntil}: ${formatDate(version.validUntil)}</b></span>`;

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

  return `<!DOCTYPE html>
<html dir="rtl" lang="${lang}">
<head>
<meta charset="utf-8" />
<style>
  /* ★ حجم الورقة صريح: بلا هذا تُطبع على US Letter في الإعدادات الأمريكية
     فيُقصّ الهامش الأيمن من وثيقةٍ صُمّمت على A4.
     والهامش الأفقيّ صفرٌ كي يمتدّ شريط الرأس واللون إلى حافّة الورقة؛
     الحشوة الأفقيّة يتولّاها .pad داخلًا. و«first:» يُلغي الهامش العلويّ
     للصفحة الأولى وحدها - فالشريط يلامس الحافّة، والصفحات التالية تحتفظ
     بهامشها فلا يلتصق الجدول بحرف الورقة. */
  @page { size: A4; margin: 12mm 0; }
  @page :first { margin-top: 0; }

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

  :root {${themeVars(theme)}
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* ★ الألوان تُطبع كما تُرى: بلا هذا يُسقط المتصفّح كلّ خلفيّةٍ مساحيّة حين
     تكون «رسوم الخلفية» مطفأة في حوار الطباعة - وهي مطفأةٌ افتراضيًّا في
     كروم. فتخرج رؤوس الجدول والشارة والصناديق **بيضاء على بيضاء**. */
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Doc', 'DocAlt', "Helvetica Neue", Arial, sans-serif;
    direction: rtl; text-align: right; color: var(--ink);
    background: #FFFFFF; -webkit-font-smoothing: antialiased;
    font-size: var(--base); line-height: 1.5; }
  /* أرقامٌ بعرضٍ واحد: بدونها لا تصطفّ خانات الأسعار تحت بعضها في العمود */
  .num, .totals .r, .grand, .brand-contact { font-variant-numeric: tabular-nums; }

  .pad { padding: 0 14mm; }

  /* ───────── العلامة ───────── */
  .brand-row { display: flex; align-items: center; gap: 11px; }
  .logo { color: var(--accent); display: inline-flex; }
  .logo.on-accent { color: var(--on-accent); }
  .brand { display: block; font-size: calc(var(--base) * 2.05 * var(--brand-scale)); font-weight: 700;
    color: var(--accent-deep); letter-spacing: .3px; line-height: 1.08; }
  .brand-sub { display: block; font-size: calc(var(--base) * .95); font-weight: 700;
    color: var(--accent); margin-top: 2px; }
  .brand-contact { display: block; color: var(--ink-muted);
    font-size: calc(var(--base) * .87); margin-top: 2px; }

  .badge { background: var(--accent); color: var(--on-accent); padding: 6px 15px;
    border-radius: 999px; font-size: calc(var(--base) * .98); font-weight: 700;
    display: inline-block; }
  .meta { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .87);
    line-height: 1.8; margin-top: 7px; }
  .meta b { color: var(--accent-deep); }
  .meta-block { text-align: left; }

  /* ───────── بطاقتا الزبون والمشروع ───────── */
  .grid { display: flex; gap: 12px; margin-bottom: var(--gap); }
  .box { flex: 1; background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: var(--pad) calc(var(--pad) + 2px); }
  .box h3 { font-size: calc(var(--base) * .86); color: var(--ink-muted);
    font-weight: 700; margin-bottom: 5px; letter-spacing: .3px; }
  .box .big { font-size: calc(var(--base) * 1.14); font-weight: 700; color: var(--accent-deep); }
  .box .muted { color: var(--ink-muted); font-size: calc(var(--base) * .9); margin-top: 2px; }

  /* ───────── الجدول ───────── */
  /* عرضٌ ثابت لكل عمود: بلا هذا يبتلع عمود الوصف الصفحة ويُسحق عمودا السعر */
  table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
    margin-top: 4px; }
  col.c-idx { width: 6%; } col.c-item { width: 39%; } col.c-size { width: 18%; }
  col.c-unit { width: 16%; } col.c-total { width: 21%; }
  /* الرأس يتكرر على كل صفحة، والبند لا ينشطر بين صفحتين */
  thead { display: table-header-group; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  thead th { font-size: calc(var(--base) * .86); font-weight: 700;
    padding: var(--cell); text-align: right; }
  td { padding: var(--cell); font-size: calc(var(--base) * .95);
    vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  td.idx { color: var(--ink-muted); font-weight: 700; }
  .item-name { display: block; font-weight: 700; color: var(--accent-deep); }
  .item-desc { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .86);
    margin-top: 2px; line-height: 1.45; }
  .size { display: block; }
  .size-sub { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .86); margin-top: 2px; }
  td.total .now { display: block; font-weight: 700; color: var(--accent-deep);
    font-size: calc(var(--base) * 1.04); }

  /* ثلاثة طُرُز جدول */
  .t-boxed table { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .t-boxed thead th { background: var(--accent-soft); color: var(--accent-deep); }
  .t-boxed td { border-top: 1px solid var(--line); }
  .t-boxed tbody tr:first-child td { border-top: none; }

  .t-ruled thead th { color: var(--accent-deep); border-bottom: 2px solid var(--accent); }
  .t-ruled td { border-bottom: 1px solid var(--line); }

  .t-plain thead th { color: var(--ink-muted); border-bottom: 1px solid var(--line); }
  .t-plain td { border-bottom: 1px solid var(--line); }

  .zebra tbody tr:nth-child(even) td { background: var(--accent-soft); }

  /* السعر قبل الخصم: مقروءٌ مطبوعًا، والشطب وحده - بلونٍ دافئ - هو ما يقول
     إنه السعر القديم لا بهتان اللون. */
  .was { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .9);
    font-weight: 500; text-decoration: line-through; text-decoration-color: #E0796F;
    text-decoration-thickness: 1.4px; margin-bottom: 1px; }

  /* ───────── المجاميع ───────── */
  .totals { margin-top: var(--gap); margin-inline-start: auto; width: 300px;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--radius); padding: var(--pad) calc(var(--pad) + 2px);
    break-inside: avoid; page-break-inside: avoid; }
  .totals .r { display: flex; justify-content: space-between; padding: 4px 0;
    font-size: var(--base); color: var(--ink); }
  /* «قبل الخصم» يُشطب كما يُشطب سعر البند - نفس اللغة البصرية */
  .totals .r .strike { color: var(--ink-muted); text-decoration: line-through;
    text-decoration-color: #E0796F; text-decoration-thickness: 1.4px; }
  .totals .save { color: #067A5B; font-weight: 700;
    border-top: 1px dashed var(--line); margin-top: 8px; padding-top: 8px; }
  .grand { display: flex; justify-content: space-between; align-items: baseline;
    border-top: 2px solid var(--accent); margin-top: 9px; padding-top: 10px;
    font-size: calc(var(--base) * 1.42); font-weight: 700; color: var(--accent); }
  .grand .label { font-size: calc(var(--base) * 1.08); color: var(--accent-deep); }

  /* ───────── الذيل والتوقيع ───────── */
  .foot { margin-top: 20px; font-size: calc(var(--base) * .86); color: var(--ink-muted);
    line-height: 1.75; border-top: 1px solid var(--line); padding-top: 12px;
    break-inside: avoid; }
  .foot .note { color: var(--accent-deep); font-weight: 700; margin-bottom: 5px; }
  .thanks { color: var(--accent); font-weight: 700; margin-top: 6px; }
  .sign { display: flex; gap: 40px; margin-top: 18px; break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid var(--line); padding-top: 6px;
    color: var(--ink-muted); font-size: calc(var(--base) * .84); }

  /* لمسة القالب الكلاسيكيّ: خيطٌ ذهبيّ تحت الفاصل */
  .second-rule { height: 2px; background: var(--second); width: 64px; margin-top: 10px; }

  /* ───────── بطاقات البنود ───────── */
  .qcards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  .qcard { position: relative; border: 1px solid var(--line); background: var(--surface);
    padding: 11px 12px 10px; break-inside: avoid; page-break-inside: avoid; }
  .qcard h4 { font-size: calc(var(--base) * 1.06); color: var(--accent-deep);
    margin-inline-end: 22px; }
  .qc-n { position: absolute; inset-inline-end: 0; top: 0; width: 20px; height: 20px;
    background: var(--accent); color: var(--on-accent); font-size: calc(var(--base) * .8);
    font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .qc-cat { color: var(--accent); font-size: calc(var(--base) * .84); margin-top: 2px; font-weight: 700; }
  .qc-desc { color: var(--ink-muted); font-size: calc(var(--base) * .84); margin-top: 2px; }
  .qcard dl { display: flex; gap: 10px; margin-top: 7px; flex-wrap: wrap; }
  .qcard dt { color: var(--ink-muted); font-size: calc(var(--base) * .78); }
  .qcard dd { font-size: calc(var(--base) * .92); font-variant-numeric: tabular-nums; }
  .qc-total { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line);
    text-align: start; font-size: calc(var(--base) * 1.1); color: var(--accent-deep);
    font-variant-numeric: tabular-nums; }

  /* ───────── هندسة التخطيط ───────── */
${layoutCss(theme.layout)}
</style>
</head>
<body class="lay-${theme.layout} tpl-${theme.id} t-${theme.table} it-${theme.itemStyle}${theme.zebra ? ' zebra' : ''}">
  ${header}

  <main class="pad">
    ${theme.second ? '<div class="second-rule"></div>' : ''}

    <div class="grid" style="margin-top:14px">
      <div class="box">
        <h3>${t.customer}</h3>
        <div class="big">${e(customerName)}</div>
        <div class="muted">${e(customerPhone)}${customerCity ? ' • ' + e(tr(customerCity)) : ''}</div>
      </div>
      <div class="box">
        <h3>${t.project}</h3>
        <div class="big">${e(tr(projectTitle))}</div>
        <div class="muted">${t.itemsCount(version.items.length)}</div>
      </div>
    </div>

    ${itemsHtml}

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
