/**
 * رؤوس وثيقة عرض السعر - ثماني بنياتٍ من مدرسة التصميم التجاريّ المحترف.
 *
 * القاعدة التي تحكمها جميعًا: **إيماءةٌ واحدة لكلّ قالب** - لوحٌ داكن، أو
 * رقمٌ طباعيّ ضخم، أو لوحٌ جانبيّ، أو توسيطٌ رسميّ، أو قاعدةٌ سوداء، أو
 * شريطٌ نحيل، أو ظلٌّ طباعيّ، أو رأسٌ نحيل. لا زخارف متراكمة: الاحترافيّة
 * من الضبط لا من الإضافة.
 *
 * ★ كلّ عنصرٍ هنا يعيش **في التدفّق** داخل الرأس، فيظهر على الصفحة الأولى
 * ويمضي - ولا يطفو فوق جداول الصفحات التالية. وما يجب أن يتكرّر على كلّ
 * صفحة (لوح «panel») يُرسَم خلفيّةً على body في quoteLayoutCss.
 */
import type { QuoteTheme } from '@/domain/quoteThemes';

/** ما يحتاجه الرأس من الوثيقة كي يرسم نفسه. */
export interface LayoutContext {
  brandName: string;
  orgLine: string;
  logo: (size: number) => string;
  quoteLabel: string;
  number: string;
  metaHtml: string;
  theme: QuoteTheme;
}

/* لوحُ رأسٍ داكن ممتدّ، وخيطٌ ثانٍ (ذهب) على قاعدته */
const headBand = (c: LayoutContext) => `
  <header class="hd hd-band">
    <div class="band-brand">
      <span class="logo on">${c.logo(36)}</span>
      <span>
        <span class="brand on">${c.brandName}</span>
        <span class="org on">${c.orgLine}</span>
      </span>
    </div>
    <div class="band-meta">
      <span class="doc-label on">${c.quoteLabel}</span>
      <span class="doc-number on">${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

/* سويسريّ: علامةٌ هادئة أعلى، ثم رقم العرض عنوانًا ضخمًا فوق خطٍّ شعريّ */
const headDisplay = (c: LayoutContext) => `
  <header class="hd hd-display">
    <div class="disp-top">
      <span class="brand-line"><span class="logo">${c.logo(24)}</span> ${c.brandName}</span>
      <span class="org">${c.orgLine}</span>
    </div>
    <div class="disp-main">
      <span class="doc-label">${c.quoteLabel}</span>
      <span class="doc-display">${c.number}</span>
    </div>
    <div class="disp-meta">${c.metaHtml}</div>
  </header>`;

/* لوحٌ جانبيّ: العلامة والبيانات داخل عمودٍ مصمت يمتدّ على كلّ صفحة */
const headPanel = (c: LayoutContext) => `
  <header class="hd hd-panel">
    <div class="panel-in">
      <span class="logo on">${c.logo(40)}</span>
      <span class="brand on">${c.brandName}</span>
      <span class="org on">${c.orgLine}</span>
      <div class="panel-sep"></div>
      <span class="doc-label on">${c.quoteLabel}</span>
      <span class="doc-number on">${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

/* توسيطٌ رسميّ: علامةٌ في المنتصف وخطٌّ مزدوج - عُرف الورق الفاخر */
const headCentered = (c: LayoutContext) => `
  <header class="hd hd-centered">
    <span class="logo">${c.logo(34)}</span>
    <span class="brand">${c.brandName}</span>
    <span class="org">${c.orgLine}</span>
    <div class="dbl-rule"></div>
    <div class="cen-meta">
      <span class="doc-label">${c.quoteLabel}</span>
      <span class="doc-number">${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

/* قاعدةٌ سوداء حازمة أعلى الورقة - أقصى الرسميّة بأقلّ الوسائل */
const headRule = (c: LayoutContext) => `
  <header class="hd hd-rule">
    <div class="rule-top"></div>
    <div class="rule-row">
      <div>
        <span class="logo">${c.logo(30)}</span>
        <span class="brand">${c.brandName}</span>
        <span class="org">${c.orgLine}</span>
      </div>
      <div class="rule-meta">
        <span class="doc-label">${c.quoteLabel}</span>
        <span class="doc-number">${c.number}</span>
        ${c.metaHtml}
      </div>
    </div>
  </header>`;

/* شريطٌ علويّ نحيل بلون القائد ثمّ رأسٌ أبيض هادئ */
const headStrip = (c: LayoutContext) => `
  <header class="hd hd-strip">
    <div class="strip"></div>
    <div class="strip-row">
      <div>
        <span class="logo">${c.logo(32)}</span>
        <span class="brand">${c.brandName}</span>
        <span class="org">${c.orgLine}</span>
      </div>
      <div class="strip-meta">
        <span class="doc-label">${c.quoteLabel}</span>
        <span class="doc-number">${c.number}</span>
        ${c.metaHtml}
      </div>
    </div>
  </header>`;

/* ظلٌّ طباعيّ: رقم العرض خلف الرأس بشفافيةٍ خافتة - أناقة المجلّات */
const headGhost = (c: LayoutContext) => `
  <header class="hd hd-ghost">
    <span class="ghost" aria-hidden="true">${c.number}</span>
    <div class="ghost-row">
      <div>
        <span class="logo">${c.logo(32)}</span>
        <span class="brand">${c.brandName}</span>
        <span class="org">${c.orgLine}</span>
      </div>
      <div class="ghost-meta">
        <span class="doc-label">${c.quoteLabel}</span>
        <span class="doc-number">${c.number}</span>
        ${c.metaHtml}
      </div>
    </div>
  </header>`;

/* رأسٌ نحيل لدفترٍ كثيف - كلّ المساحة للبنود */
const headSlim = (c: LayoutContext) => `
  <header class="hd hd-slim">
    <div class="slim-brand">
      <span class="logo">${c.logo(24)}</span>
      <span class="brand">${c.brandName}</span>
      <span class="org">${c.orgLine}</span>
    </div>
    <div class="slim-meta">
      <span class="doc-label">${c.quoteLabel}</span>
      <span class="doc-number">${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

export type LayoutId =
  | 'band' | 'display' | 'panel' | 'centered'
  | 'rule' | 'strip' | 'ghost' | 'slim';

export const HEADERS: Record<LayoutId, (c: LayoutContext) => string> = {
  band: headBand,
  display: headDisplay,
  panel: headPanel,
  centered: headCentered,
  rule: headRule,
  strip: headStrip,
  ghost: headGhost,
  slim: headSlim,
};
