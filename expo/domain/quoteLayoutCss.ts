/**
 * أنماط رؤوس الوثيقة الثمانية.
 *
 * قواعد مشتركة تحكمها كلّها (من أفضل ممارسات وثائق الأعمال):
 * - التسمية الصغيرة فوق القيمة: خطٌّ صغير باهتٌ ثقيل، والقيمة تحته أكبر
 *   وأدكن - هرميّةٌ تُقرأ قبل أن تُفهم.
 * - رقمُ الوثيقة عنصرُ هويّةٍ لا حاشية.
 * - الإيماءة الواحدة: ما يميّز القالب شيءٌ واحد مضبوط، والباقي صمت.
 *
 * ★ ما يجب أن يتكرّر على كلّ صفحةٍ مطبوعة يُرسَم خلفيّةً على body -
 * العنصر في التدفّق يظهر مرّةً واحدة مهما طالت الوثيقة.
 */
import type { LayoutId } from '@/domain/quoteLayouts';

const SHARED = `
  .hd { position: relative; }
  .hd .logo { color: var(--accent); display: inline-flex; vertical-align: middle; }
  .hd .logo.on { color: var(--on-accent); }
  .hd .brand { display: block; font-weight: 700; letter-spacing: .2px; line-height: 1.08;
    font-size: calc(var(--base) * 1.9 * var(--brand-scale)); color: var(--accent-deep); }
  .hd .brand.on { color: var(--on-accent); }
  .hd .org { display: block; font-size: calc(var(--base) * .84); color: var(--ink-muted);
    margin-top: 3px; }
  .hd .org.on { color: var(--on-accent); opacity: .72; }
  /* التسمية فوق الرقم: صغيرةٌ باهتة ثقيلة - ثم الرقم أكبر وأدكن */
  .doc-label { display: block; font-size: calc(var(--base) * .8); font-weight: 700;
    color: var(--ink-muted); letter-spacing: .6px; }
  .doc-label.on { color: var(--on-accent); opacity: .66; }
  .doc-number { display: block; font-size: calc(var(--base) * 1.5); font-weight: 700;
    color: var(--accent-deep); font-variant-numeric: tabular-nums; margin-top: 1px; }
  .doc-number.on { color: var(--on-accent); }
  .meta { display: block; color: var(--ink-muted); font-size: calc(var(--base) * .84);
    line-height: 1.75; margin-top: 6px; }
  .meta b { color: var(--ink); }`;

const CSS: Record<LayoutId, string> = {
  /* ── لوحٌ فحميّ وخيطُ ذهبٍ على قاعدته ── */
  band: `
  .hd-band { background: var(--accent); padding: 12mm 14mm 10mm;
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 3px solid var(--second, var(--accent)); }
  .band-brand { display: flex; align-items: center; gap: 12px; }
  .band-meta { text-align: start; }
  .band-meta .meta { color: var(--on-accent); opacity: .72; }
  .band-meta .meta b { color: var(--on-accent); }`,

  /* ── سويسريّ: رقمُ العرض عنوانٌ ضخم ── */
  display: `
  .hd-display { padding: 13mm 14mm 0; }
  .disp-top { display: flex; justify-content: space-between; align-items: baseline; }
  .brand-line { font-weight: 700; font-size: calc(var(--base) * 1.15); color: var(--ink); }
  .disp-top .org { margin: 0; }
  .disp-main { margin-top: 9mm; }
  .disp-main .doc-label { letter-spacing: 1px; }
  .doc-display { display: block; font-size: calc(var(--base) * 3.4); font-weight: 700;
    color: var(--accent); line-height: 1.05; font-variant-numeric: tabular-nums;
    letter-spacing: .5px; }
  .disp-meta { display: flex; gap: 26px; margin-top: 5mm; padding-bottom: 5mm;
    border-bottom: 1.5px solid var(--ink); }
  .disp-meta .meta { margin-top: 0; }`,

  /* ── لوحٌ جانبيّ: العمود خلفيّةُ body (فيتكرّر على كلّ صفحة)، ونصّ اللوح
     يهرب من حشوة body بإزاحةٍ سالبة فيقع فوق العمود الملوّن بالضبط.
     ★ فخّ RTL الذي أُصلح: padding-inline-end يقع يسارًا واللوح يمين -
     فكان الجدول يركب على اللوح. القياس في المتصفّح هو الذي كشفه. */
  panel: `
  .hd-panel { padding: 0; height: 0; }
  .panel-in { position: absolute; inset-inline-start: -58mm; top: 0; width: 58mm;
    padding: 14mm 8mm 0; }
  .panel-in .brand { margin-top: 7px; }
  .panel-sep { height: 1px; background: var(--on-accent); opacity: .28; margin: 8mm 0 6mm; }
  .panel-in .meta { color: var(--on-accent); opacity: .74; }
  .panel-in .meta b { color: var(--on-accent); }
  body.lay-panel main { padding-top: 12mm; }`,

  /* ── توسيطٌ رسميّ وخطٌّ مزدوج ── */
  centered: `
  .hd-centered { text-align: center; padding: 14mm 14mm 0; }
  .hd-centered .org { margin-inline: auto; }
  .hd-centered .brand { margin-top: 6px; }
  .dbl-rule { height: 5px; margin: 7mm auto 5mm; width: 100%;
    border-top: 1.5px solid var(--accent); border-bottom: .8px solid var(--accent); }
  .cen-meta .doc-label { display: inline; margin-inline-end: 6px; }
  .cen-meta .doc-number { display: inline; }
  .cen-meta .meta { text-align: center; }`,

  /* ── قاعدةٌ سوداء حازمة ── */
  rule: `
  .hd-rule { padding: 0 14mm; }
  .rule-top { height: 4px; background: var(--accent); margin: 0 -14mm; }
  .rule-row { display: flex; justify-content: space-between; align-items: flex-start;
    padding-top: 9mm; }
  .rule-meta { text-align: start; }`,

  /* ── شريطٌ علويّ نحيل ── */
  strip: `
  .hd-strip { padding: 0 14mm; }
  .strip { height: 6mm; background: var(--accent); margin: 0 -14mm; }
  .strip-row { display: flex; justify-content: space-between; align-items: flex-start;
    padding-top: 8mm; }
  .strip-meta { text-align: start; }`,

  /* ── ظلٌّ طباعيّ خلف الرأس ── */
  ghost: `
  .hd-ghost { padding: 13mm 14mm 0; overflow: hidden; }
  .ghost { position: absolute; inset-inline-end: 6mm; top: 2mm;
    font-size: calc(var(--base) * 7.5); font-weight: 700; color: var(--accent);
    opacity: .06; line-height: 1; font-variant-numeric: tabular-nums;
    letter-spacing: 2px; pointer-events: none; }
  .ghost-row { position: relative; display: flex; justify-content: space-between;
    align-items: flex-start; }
  .ghost-meta { text-align: start; }`,

  /* ── رأسٌ نحيل ── */
  slim: `
  .hd-slim { padding: 9mm 14mm 4mm; display: flex; justify-content: space-between;
    align-items: flex-end; border-bottom: 2px solid var(--accent); }
  .slim-brand { display: flex; align-items: center; gap: 8px; }
  .slim-brand .brand { display: inline-block; }
  .slim-brand .org { margin: 0 8px 0 0; }
  .slim-meta { display: flex; align-items: baseline; gap: 10px; }
  .slim-meta .meta { margin: 0; }`,
};

/** خلفيّاتٌ على body - وحدها تتكرّر على كلّ صفحةٍ مطبوعة. */
const BODY_BG: Partial<Record<LayoutId, string>> = {
  panel: `linear-gradient(to left, var(--accent) 0 58mm, var(--paper) 58mm)`,
};

/** حشوةٌ تفسح للخلفيّة حيث اقتطعت جزءًا من عرض الورقة. */
const BODY_PAD: Partial<Record<LayoutId, string>> = {
  panel: 'padding-inline-start: 58mm;',
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
