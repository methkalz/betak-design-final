/**
 * تخطيطات وثيقة عرض السعر - **ثمانية تراكيب مختلفة**، لا ثمانية ألوان.
 *
 * ## النقد الذي وُلد منه هذا الملفّ
 *
 * أوّل محاولةٍ للقوالب جعلت الاختلاف رموزًا لونيّة فوق هيكلٍ واحد: رأسٌ ثمّ
 * بطاقتان ثمّ جدولٌ ثمّ صندوق مجاميع. النتيجة ثماني ورقاتٍ **متطابقة البنية**
 * مختلفة اللون - وهو ما رآه المالك بحقّ «تغييرًا بالألوان بالأساس».
 *
 * هنا كلّ قالبٍ **تركيبٌ مستقلّ**: موضع العلامة، وشكل الرأس (قوس، قطر،
 * فسيفساء، مثلّثات، عمود)، وطريقة عرض البنود (جدول أو بطاقات أو دفتر)،
 * وشكل المجاميع. الأشكال الهندسيّة جزءٌ من التركيب لا زينةٌ مضافة.
 *
 * ## ما يبقى مشتركًا عمدًا
 *
 * **الأرقام والحقول**: كلّ تخطيطٍ يعرض نفس البيانات بنفس القيم - يقفل ذلك
 * اختبارٌ يقارن كلّ رقمٍ نقديّ عبر الثمانية. الاختلاف في الشكل وحده.
 *
 * ## قيود الطباعة التي تحكم التصميم
 *
 * - ما يجب أن يتكرّر على كلّ صفحة يُرسم **خلفيّةً على `body`** لا عنصرًا في
 *   التدفّق: العنصر يظهر مرّةً، والخلفيّة تُعاد لكلّ ورقة.
 * - `clip-path` و`border-radius` و`conic-gradient` تُطبع في كروم، لكنّها
 *   تحتاج `print-color-adjust: exact` وإلا سقطت.
 * - كلّ زخرفةٍ مطلقةُ الموضع تُقيَّد بالصفحة الأولى (`.page-1`) وإلا طفت فوق
 *   جدول الصفحة الثانية.
 */
import type { QuoteTheme } from '@/domain/quoteThemes';

export type ItemStyle = 'table' | 'cards' | 'ledger';

/** ما يحتاجه التخطيط من الوثيقة كي يرسم رأسه. */
export interface LayoutContext {
  brandName: string;
  orgLine: string;
  logo: (size: number) => string;
  quoteLabel: string;
  number: string;
  metaHtml: string;
  theme: QuoteTheme;
}

/* ────────────────────────── الرؤوس الثمانية ────────────────────────── */

const headArc = (c: LayoutContext) => `
  <header class="hd hd-arc">
    <div class="arc"></div>
    <div class="arc-in">
      <span class="logo on">${c.logo(40)}</span>
      <span class="brand on">${c.brandName}</span>
      <span class="org on">${c.orgLine}</span>
    </div>
    <div class="arc-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

const headDiagonal = (c: LayoutContext) => `
  <header class="hd hd-diag">
    <div class="diag"></div>
    <div class="diag-brand">
      <span class="logo on">${c.logo(38)}</span>
      <span class="brand on">${c.brandName}</span>
      <span class="org on">${c.orgLine}</span>
    </div>
    <div class="diag-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

const headMosaic = (c: LayoutContext) => {
  // تسع مربّعاتٍ متدرّجة الشفافية - الشكل الهندسيّ هو الهويّة هنا
  const cells = Array.from({ length: 9 }, (_, k) => `<i style="opacity:${((k % 3) + 1) / 3.4}"></i>`).join('');
  return `
  <header class="hd hd-mosaic">
    <div class="mosaic">${cells}</div>
    <div class="mos-brand">
      <span class="logo">${c.logo(34)}</span>
      <span class="brand">${c.brandName}</span>
      <span class="org">${c.orgLine}</span>
    </div>
    <div class="mos-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;
};

const headTriangles = (c: LayoutContext) => {
  const tri = Array.from({ length: 14 }, (_, k) => `<i style="opacity:${k % 2 ? 0.5 : 1}"></i>`).join('');
  return `
  <header class="hd hd-tri">
    <div class="tri-top">
      <div class="tri-brand">
        <span class="logo on">${c.logo(36)}</span>
        <span class="brand on">${c.brandName}</span>
        <span class="org on">${c.orgLine}</span>
      </div>
      <div class="tri-meta">
        <span class="badge">${c.quoteLabel} ${c.number}</span>
        ${c.metaHtml}
      </div>
    </div>
    <div class="zigzag">${tri}</div>
  </header>`;
};

const headColumn = (c: LayoutContext) => `
  <header class="hd hd-col">
    <div class="col-brand">
      <span class="logo on">${c.logo(40)}</span>
      <span class="brand on">${c.brandName}</span>
      <span class="org on">${c.orgLine}</span>
    </div>
    <div class="col-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

const headStack = (c: LayoutContext) => `
  <header class="hd hd-stack">
    <span class="logo">${c.logo(46)}</span>
    <span class="brand">${c.brandName}</span>
    <span class="org">${c.orgLine}</span>
    <div class="stack-rule"><i></i><i></i><i></i></div>
    <div class="stack-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

const headBlueprint = (c: LayoutContext) => `
  <header class="hd hd-blue">
    <div class="bp-marks"><i></i><i></i><i></i><i></i></div>
    <div class="bp-brand">
      <span class="logo">${c.logo(32)}</span>
      <span class="brand">${c.brandName}</span>
      <span class="org">${c.orgLine}</span>
    </div>
    <div class="bp-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

const headLedger = (c: LayoutContext) => `
  <header class="hd hd-ledger">
    <div class="ldg-brand">
      <span class="logo">${c.logo(26)}</span>
      <span class="brand">${c.brandName}</span>
      <span class="org">${c.orgLine}</span>
    </div>
    <div class="ldg-meta">
      <span class="badge">${c.quoteLabel} ${c.number}</span>
      ${c.metaHtml}
    </div>
  </header>`;

export type LayoutId =
  | 'arc' | 'diagonal' | 'mosaic' | 'triangles'
  | 'column' | 'stack' | 'blueprint' | 'ledger';

export const HEADERS: Record<LayoutId, (c: LayoutContext) => string> = {
  arc: headArc,
  diagonal: headDiagonal,
  mosaic: headMosaic,
  triangles: headTriangles,
  column: headColumn,
  stack: headStack,
  blueprint: headBlueprint,
  ledger: headLedger,
};
