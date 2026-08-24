/**
 * هندسة التخطيطات الثمانية.
 *
 * كلّ كتلةٍ هنا **تركيبٌ مستقلّ** لا لونٌ فوق هيكلٍ مشترك: قوسٌ مقتطع، قطرٌ
 * يشقّ الرأس، فسيفساء مربّعات، شريط مثلّثات، عمودٌ رأسيّ يمتدّ على الورقة،
 * كومةٌ موسَّطة، شبكةُ مخطّطٍ هندسيّ، ودفترٌ كثيف.
 *
 * ★ قاعدةٌ تحكم كلّ زخرفة: ما يجب أن يتكرّر على كلّ صفحةٍ مطبوعة يُرسَم
 * **خلفيّةً على `body`**؛ وما يخصّ الصفحة الأولى وحدها يعيش داخل الرأس نفسه
 * فيمضي مع التدفّق ولا يطفو فوق جدول الصفحة الثانية.
 */
import type { LayoutId } from '@/domain/quoteLayouts';

const SHARED = `
  .hd { position: relative; }
  .hd .logo { color: var(--accent); display: inline-flex; vertical-align: middle; }
  .hd .logo.on { color: var(--on-accent); }
  .hd .brand { display: block; font-weight: 700; letter-spacing: .3px; line-height: 1.06;
    font-size: calc(var(--base) * 2.05 * var(--brand-scale)); color: var(--accent-deep); }
  .hd .brand.on, .hd .org.on { color: var(--on-accent); }
  .hd .org { display: block; font-size: calc(var(--base) * .88); color: var(--ink-muted); margin-top: 3px; }
  .hd .org.on { opacity: .82; }
  .badge { display: inline-block; background: var(--accent); color: var(--on-accent);
    padding: 6px 15px; border-radius: 999px; font-weight: 700; font-size: calc(var(--base) * .98); }
  .meta { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .87);
    line-height: 1.8; margin-top: 7px; }
  .meta b { color: var(--accent-deep); }`;

const CSS: Record<LayoutId, string> = {
  /* ── قوس: ربعُ دائرةٍ ملوّن يملأ ركن الورقة، والعلامة داخله ── */
  arc: `
  .hd-arc { min-height: 62mm; padding: 0; }
  .arc { position: absolute; inset-inline-start: -36mm; top: -46mm;
    width: 128mm; height: 128mm; border-radius: 50%;
    background: var(--accent); }
  .arc-in { position: relative; padding: 14mm 14mm 0; }
  .arc-in .brand, .arc-in .org, .arc-in .logo { position: relative; }
  .arc-meta { position: absolute; inset-inline-end: 14mm; top: 15mm; text-align: start; }
  .hd-arc + .body-pad { margin-top: 6mm; }`,

  /* ── قطريّ: كتلةٌ لونيّة يشقّها قطرٌ حادّ ── */
  diagonal: `
  .hd-diag { min-height: 56mm; padding: 0; overflow: hidden; }
  .diag { position: absolute; inset: 0; background: var(--accent);
    clip-path: polygon(0 0, 100% 0, 100% 58%, 0 100%); }
  .diag-brand { position: relative; padding: 13mm 14mm 0; }
  .diag-meta { position: absolute; inset-inline-end: 14mm; bottom: 6mm; text-align: start; }
  .diag-meta .meta { color: var(--ink-muted); }
  .diag-meta .meta b { color: var(--accent-deep); }`,

  /* ── فسيفساء: تسع مربّعاتٍ متدرّجة تصنع الهويّة ── */
  mosaic: `
  .hd-mosaic { padding: 13mm 14mm 0; display: flex; justify-content: space-between;
    align-items: flex-start; }
  .mosaic { position: absolute; inset-inline-end: 14mm; top: 13mm;
    display: grid; grid-template-columns: repeat(3, 9mm); grid-auto-rows: 9mm; gap: 2mm; }
  .mosaic i { display: block; background: var(--accent); }
  .mos-brand { padding-top: 2mm; }
  .mos-meta { margin-top: 32mm; text-align: start; }
  .hd-mosaic::after { content: ''; position: absolute; inset-inline: 14mm; bottom: 0;
    height: 3px; background: var(--accent); }`,

  /* ── مثلّثات: شريطٌ متعرّج يفصل الرأس عن المتن ── */
  triangles: `
  .hd-tri { padding: 0; }
  .tri-top { background: var(--accent); padding: 12mm 14mm 9mm;
    display: flex; justify-content: space-between; align-items: flex-start; }
  .tri-meta { text-align: start; }
  .tri-meta .badge { background: rgba(255,255,255,.18); }
  .tri-meta .meta, .tri-meta .meta b { color: var(--on-accent); opacity: .9; }
  .zigzag { display: flex; height: 7mm; }
  .zigzag i { flex: 1; background: var(--accent);
    clip-path: polygon(0 0, 100% 0, 50% 100%); }`,

  /* ── عمود: شريطٌ رأسيّ يمتدّ على الورقة كلّها وعلى كلّ صفحة ── */
  column: `
  .hd-col { padding: 13mm 14mm 0; display: flex; justify-content: space-between;
    align-items: flex-start; }
  .col-brand { padding-inline-end: 2mm; }
  .col-meta { text-align: start; margin-top: 1mm; }
  .col-meta .badge { background: rgba(255,255,255,.18); }
  .col-meta .meta, .col-meta .meta b { color: var(--on-accent); opacity: .9; }`,

  /* ── كومة: كلّ شيءٍ موسَّط، وثلاثة خطوطٍ تفصل ── */
  stack: `
  .hd-stack { display: block; text-align: center; padding: 15mm 14mm 0; }
  .hd-stack .brand { margin-top: 5px; }
  .hd-stack .org { margin-inline: auto; }
  .stack-rule { display: flex; gap: 5px; justify-content: center; margin: 9px 0 11px; }
  .stack-rule i { display: block; height: 3px; background: var(--accent); }
  .stack-rule i:nth-child(1) { width: 26px; opacity: .35; }
  .stack-rule i:nth-child(2) { width: 46px; }
  .stack-rule i:nth-child(3) { width: 26px; opacity: .35; }
  .stack-meta { text-align: center; }
  .stack-meta .meta { text-align: center; }`,

  /* ── مخطّط هندسيّ: شبكةٌ خافتة وعلاماتُ ركن - يليق بمحلّ قياسات ── */
  blueprint: `
  .hd-blue { padding: 13mm 14mm 0; display: flex; justify-content: space-between;
    align-items: flex-start; }
  .bp-meta { text-align: start; }
  .bp-marks i { position: absolute; width: 6mm; height: 6mm; border: 1.4px solid var(--accent); opacity: .55; }
  .bp-marks i:nth-child(1) { inset-inline-start: 5mm; top: 5mm; border-inline-end: 0; border-bottom: 0; }
  .bp-marks i:nth-child(2) { inset-inline-end: 5mm; top: 5mm; border-inline-start: 0; border-bottom: 0; }
  .bp-marks i:nth-child(3) { inset-inline-start: 5mm; bottom: -3mm; border-inline-end: 0; border-top: 0; }
  .bp-marks i:nth-child(4) { inset-inline-end: 5mm; bottom: -3mm; border-inline-start: 0; border-top: 0; }
  .hd-blue::after { content: ''; position: absolute; inset-inline: 14mm; bottom: -3mm;
    height: 1.4px; background: var(--accent); opacity: .5; }`,

  /* ── دفتر: رأسٌ نحيل، كلّ المساحة للبنود ── */
  ledger: `
  .hd-ledger { padding: 10mm 14mm 0; display: flex; justify-content: space-between;
    align-items: flex-end; border-bottom: 2px solid var(--accent); padding-bottom: 5mm; }
  .hd-ledger .brand { display: inline-block; }
  .hd-ledger .logo { margin-inline-end: 6px; }
  .ldg-brand { display: flex; align-items: center; gap: 8px; }
  .ldg-brand .org { margin-top: 0; margin-inline-start: 8px; }
  .ldg-meta { text-align: start; }
  .ldg-meta .meta { margin-top: 4px; }`,
};

/**
 * خلفيّاتٌ تُرسم على `body` - وهي وحدها ما **يتكرّر على كلّ صفحة**.
 * عنصرٌ في التدفّق يظهر مرّةً واحدة مهما كان طول الوثيقة.
 */
const BODY_BG: Partial<Record<LayoutId, string>> = {
  column: `linear-gradient(to left, var(--accent) 0 34mm, #FFFFFF 34mm)`,
  blueprint:
    `linear-gradient(var(--grid) 1px, transparent 1px) 0 0/8mm 8mm,` +
    `linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0/8mm 8mm`,
};

/** حشوةٌ إضافية حيث تقتطع الخلفيّة جزءًا من عرض الورقة. */
const BODY_PAD: Partial<Record<LayoutId, string>> = {
  column: 'padding-inline-end: 34mm;',
};

export function layoutCss(id: LayoutId): string {
  const bg = BODY_BG[id];
  const pad = BODY_PAD[id];
  return [
    SHARED,
    CSS[id],
    bg ? `  body { background: ${bg}; }` : '',
    pad ? `  body { ${pad} }` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
