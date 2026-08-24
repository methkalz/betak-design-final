/**
 * مِشرحة الوثيقة - تُخرج عرض سعرٍ حقيقيًّا إلى ملفّ HTML لفحصه في المتصفّح.
 *
 * لماذا: الوثيقة تُطبع على ورقةٍ يوقّعها زبون، وأيّ خللٍ في الاتجاه أو الخطّ
 * أو قصّ الصفحات لا يظهر في اختبار وحدة. هذه أداةُ فحصٍ بصريّ لا شيفرة إنتاج.
 *
 *   bun run tools/quote-preview.ts [out-dir]
 *
 * تُنتج ملفًّا لكلّ (لغة × طول) فتُقارَن جنبًا إلى جنب.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { buildQuoteHtml, type QuoteDocData } from '../domain/quoteDoc';
import { QUOTE_TEMPLATES } from '../domain/quoteThemes';
import type { QuotationItem, QuotationVersion } from '../types/domain';

const OUT = process.argv[2] ?? join(process.cwd(), '.quote-preview');

const ROOMS = ['الصالون', 'غرفة الأهل', 'غرفة الأولاد', 'المطبخ', 'المكتب', 'غرفة الضيوف'];
const ORD = ['الاول', 'الثاني', 'الثالث'];

function items(n: number): QuotationItem[] {
  return Array.from({ length: n }, (_, k) => {
    const w = 120 + ((k * 37) % 260);
    const rm = Math.round((w / 100) * 1000) / 1000;
    const unit = 29000 + (k % 4) * 7000;
    const line = Math.floor(Math.round(rm * unit) / 100) * 100;
    return {
      id: `i${k}`, windowId: `w${k}`,
      roomName: ROOMS[k % ROOMS.length],
      windowName: `الشباك ${ORD[k % ORD.length]}`,
      description: k % 3 === 0 ? 'كريب مع بطانة - مسار كهربائي' : 'كريب بلا بطانة',
      widthCm: w, heightCm: 260 + (k % 3) * 120, runningMeters: rm, quantity: 1,
      category: k % 2 ? 'crepe_with_lining' : 'other_without_lining',
      band: 'standard',
      unitPriceAgorot: unit, lineTotalAgorot: line,
      // بندٌ من كلّ ثلاثة يحمل زيادةً تسويقية - كي يظهر السعر المشطوب
      listPriceAgorot: k % 3 === 1 ? Math.round(line * 1.18) : line,
      internalCostAgorot: Math.round(line * 0.45),
      fabricMeters: rm * 3, liningMeters: rm * 3,
    } as QuotationItem;
  });
}

function version(n: number): QuotationVersion {
  const list = items(n);
  const subtotal = list.reduce((s, i) => s + i.lineTotalAgorot, 0);
  const vat = Math.round(subtotal * 0.18);
  return {
    id: 'v1', organizationId: 'o1', quotationId: 'q1', versionNumber: 2,
    status: 'draft', items: list, subtotalAgorot: subtotal, discountPercent: 0,
    discountAgorot: 0, vatAgorot: vat, totalAgorot: subtotal + vat,
    internalCostAgorot: 0, marginPercent: 55,
    validUntil: '2026-09-30T00:00:00.000Z',
    note: 'التركيب خلال اسبوعين من تاريخ الموافقة.',
    markupSpec: null, createdBy: 'u1', createdAt: '2026-08-24T00:00:00.000Z',
    sentAt: null, approvedAt: null, locked: false,
  } as unknown as QuotationVersion;
}

const base = (n: number): Omit<QuoteDocData, 'lang' | 'template'> => ({
  version: version(n),
  orgName: 'بيتك ديزاين',
  orgAddress: 'كفرمندا',
  orgPhone: '054-9068709',
  number: 'BD-1041',
  customerName: 'مثقال زيدان',
  customerPhone: '052-6444414',
  customerCity: 'كفرمندا',
  projectTitle: 'بيت مثقال - كفرمندا',
  vatPercent: 18,
  showVat: true,
});

mkdirSync(OUT, { recursive: true });
const made: string[] = [];
for (const template of QUOTE_TEMPLATES) {
  for (const lang of ['ar', 'he'] as const) {
    // قصيرٌ لصفحةٍ واحدة، وطويلٌ يُجبر القصّ فيُفحص تكرار الرأس وحافّة الصفحة
    for (const [tag, n] of [['short', 4], ['long', 16]] as const) {
      const name = `${template}-${lang}-${tag}.html`;
      writeFileSync(join(OUT, name), buildQuoteHtml({ ...base(n), lang, template }), 'utf8');
      made.push(name);
    }
  }
}

// فهرسٌ يعرض الثمانية جنبًا إلى جنب - المقارنة بالعين لا بفتح ملفٍّ ملفّ
const links = QUOTE_TEMPLATES.map(
  (tpl) => `<li><b>${tpl}</b> ` +
    ['ar', 'he'].flatMap((l) => ['short', 'long'].map(
      (s) => `<a href="${tpl}-${l}-${s}.html">${l}/${s}</a>`)).join(' · ') +
    '</li>').join('\n');
writeFileSync(join(OUT, 'index.html'),
  `<!DOCTYPE html><html dir="rtl"><meta charset="utf-8"><title>قوالب العرض</title>
<style>body{font:15px system-ui;padding:24px;line-height:2}a{margin-inline-end:10px}</style>
<h1>قوالب وثيقة عرض السعر</h1><ul>${links}</ul></html>`, 'utf8');

console.log('OUT =', OUT);
console.log('  ملفات:', made.length + 1);
