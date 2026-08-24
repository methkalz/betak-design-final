/**
 * وثيقة عرض السعر - أوّل اختبارٍ لها في عمر المشروع.
 *
 * كانت الدالّة خاصّةً داخل ملفّ مسار، فلم يكن يمكن استدعاؤها من اختبار. وهي
 * الورقة التي يوقّعها الزبون: عطبٌ فيها ليس عطب عرضٍ بل خلافٌ على مال.
 */
import { expect, test } from 'bun:test';

import { buildQuoteHtml, escapeHtml, type QuoteDocData } from './quoteDoc';
import { QUOTE_STRINGS } from './quoteStrings';
import type { QuotationItem, QuotationVersion } from '@/types/domain';

const item = (over: Partial<QuotationItem> = {}): QuotationItem =>
  ({
    id: 'i1', windowId: 'w1', roomName: 'الصالون', windowName: 'الشباك الاول',
    description: 'كريب مع بطانة', widthCm: 250, heightCm: 300, runningMeters: 2.5,
    quantity: 1, category: 'crepe_with_lining', band: 'standard',
    unitPriceAgorot: 29000, lineTotalAgorot: 72500, listPriceAgorot: 72500,
    internalCostAgorot: 30000, fabricMeters: 7.5, liningMeters: 7.5,
    ...over,
  }) as QuotationItem;

const version = (over: Partial<QuotationVersion> = {}): QuotationVersion =>
  ({
    id: 'v1', organizationId: 'o1', quotationId: 'q1', versionNumber: 1,
    status: 'draft', items: [item()], subtotalAgorot: 72500, discountPercent: 0,
    discountAgorot: 0, vatAgorot: 13050, totalAgorot: 85550,
    internalCostAgorot: 30000, marginPercent: 58.6,
    validUntil: '2026-09-30T00:00:00.000Z', note: '', markupSpec: null,
    createdBy: 'u1', createdAt: '2026-08-24T00:00:00.000Z', sentAt: null,
    approvedAt: null, locked: false,
    ...over,
  }) as unknown as QuotationVersion;

/** متن الوثيقة وحده - كتلة CSS تحوي نِسبًا وألوانًا تُشوّش أيّ بحثٍ نصّي. */
const body = (html: string) => html.slice(html.indexOf('<body>'));

const AR = QUOTE_STRINGS.ar;

const data = (over: Partial<QuoteDocData> = {}): QuoteDocData => ({
  version: version(),
  orgPhone: '054-9068709',
  number: 'BD-1041',
  customerName: 'مثقال زيدان',
  customerPhone: '052-6444414',
  customerCity: 'كفرمندا',
  projectTitle: 'بيت مثقال',
  vatPercent: 18,
  showVat: false,
  lang: 'ar',
  ...over,
});

/* ─────────────────────────── الهروب ─────────────────────────── */

test('escapeHtml يُهرّب الخمسة كلّها', () => {
  expect(escapeHtml('a&b')).toBe('a&amp;b');
  expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
  expect(escapeHtml('q"q')).toBe('q&quot;q');
  expect(escapeHtml("it's")).toBe('it&#39;s');
  // الترتيب يهمّ: لو هُرّبت `&` أخيرًا لصارت `&lt;` هي `&amp;lt;`
  expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
});

test('★ اسمُ زبونٍ فيه وسمٌ لا يبتلع الوثيقة ولا يُنفَّذ', () => {
  const html = buildQuoteHtml(
    data({ customerName: '<script>alert(1)</script>', projectTitle: 'ستائر & مفروشات' }),
  );
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('ستائر &amp; مفروشات');
  // والوثيقة تبقى مغلقةً سليمة رغم الحمولة
  expect(html.trimEnd().endsWith('</html>')).toBe(true);
});

test('اسم الغرفة والوصف والملاحظة تُهرّب كذلك - لا الزبون وحده', () => {
  const html = buildQuoteHtml(
    data({
      version: version({
        items: [item({ roomName: 'غرفة <b>', description: 'قماش & بطانة' })],
        note: '<img src=x onerror=alert(1)>',
      }),
    }),
  );
  expect(html).toContain('غرفة &lt;b&gt;');
  expect(html).toContain('قماش &amp; بطانة');
  expect(html).not.toContain('onerror=alert(1)>');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

/* ──────────────────── سلامة الطباعة ──────────────────── */

test('الورقة A4 والألوان تُطبع كما تُرى', () => {
  const html = buildQuoteHtml(data());
  // بلا size تُطبع على US Letter في الإعدادات الأمريكية فيُقصّ الهامش
  expect(html).toContain('@page { size: A4; }');
  // بلا هذا تخرج رؤوس الجدول والشارة بيضاء على بيضاء (الافتراضي في كروم)
  expect(html).toContain('print-color-adjust: exact');
  expect(html).toContain('-webkit-print-color-adjust: exact');
});

test('الرأس يتكرّر عبر الصفحات والبند لا ينشطر', () => {
  const html = buildQuoteHtml(data());
  expect(html).toContain('thead { display: table-header-group; }');
  expect(html).toContain('break-inside: avoid');
});

/* ──────────────────── اللغة والخطّ ──────────────────── */

/**
 * ★ الخطّان معًا في كلّ وثيقة.
 *
 * لغةُ الوثيقة تحكم التسميات؛ والبيانات تخرج كما أدخلها المحلّ - فوثيقةٌ
 * عبرية لزبونٍ عبريّ تحمل «الصالون» بالعربية حتمًا. قِيس في المتصفّح أن
 * العربية داخل وثيقةٍ عبرية كانت تسقط إلى خطٍّ احتياطيّ (عرضها يساوي عرضها
 * بخطٍّ غير موجود بفارق 0.06%)، وبعد السلسلة صارت تفترق عنه بـ21.7% - أي
 * صارت تستعمل الخطّ المضمَّن فعلًا.
 */
test('★ كلّ وثيقة تحمل الخطّين: بياناتٌ بلغةٍ أخرى لا تسقط إلى خطٍّ احتياطيّ', () => {
  for (const lang of ['ar', 'he'] as const) {
    const html = buildQuoteHtml(data({ lang }));
    expect(html).toContain("font-family:'Doc';");
    expect(html).toContain("font-family:'DocAlt';");
    // السلسلة تُسمّي الاحتياطيّ المضمَّن قبل خطوط النظام
    expect(html).toContain("font-family: 'Doc', 'DocAlt',");
    // أربع حمولات خطّ: وزنان لكلّ عائلة
    expect(html.split('data:font/woff2;base64,').length - 1).toBe(4);
  }
});

test('العبرية تبدّل الخطّ المضمَّن لا الاتجاه - كلتاهما RTL', () => {
  const ar = buildQuoteHtml(data({ lang: 'ar' }));
  const he = buildQuoteHtml(data({ lang: 'he' }));
  expect(ar).toContain('<html dir="rtl" lang="ar">');
  expect(he).toContain('<html dir="rtl" lang="he">');
  // خطّان مختلفان فعلًا، لا نفس الحمولة بترويسةٍ أخرى
  expect(ar).not.toBe(he);
  const face = (h: string) => h.slice(h.indexOf('base64,'), h.indexOf('base64,') + 80);
  expect(face(ar)).not.toBe(face(he));
});

/* ──────────────────── المال ──────────────────── */

test('بلا ضريبة: لا سطر ضريبةٍ ولا ذكر لها في متن الوثيقة', () => {
  const html = body(buildQuoteHtml(data({ showVat: false })));
  // على النصّ لا على «18%»: عرضُ عمودٍ في CSS هو 18% أيضًا
  expect(html).not.toContain(AR.vat);
  expect(html).toContain(AR.grand);
  expect(html).not.toContain(AR.grandInclVat);
});

test('مع الضريبة: السطر والنسبة والإجمالي الشامل', () => {
  const html = body(buildQuoteHtml(data({ showVat: true })));
  expect(html).toContain(`${AR.vat} 18%`);
  expect(html).toContain(AR.grandInclVat);
});

test('★ التكلفة الداخلية لا تُطبع أبدًا في ورقة الزبون', () => {
  // على المتن لا الوثيقة كاملةً: حمولة الخطّ base64 تحوي أرقامًا عشوائية،
  // فبحثٌ فيها يمرّ اليوم بالحظّ ويسقط غدًا لتغيّر قصّةِ الخطّ لا لعطبٍ حقيقيّ.
  const html = body(
    buildQuoteHtml(data({ version: version({ items: [item({ internalCostAgorot: 31337 })] }) })),
  );
  expect(html).not.toContain('31337');
  // ولا مجزَّأةً كما يطبعها money بفاصلة الآلاف
  expect(html).not.toContain('313');
});

test('السعر المشطوب يظهر حين وُجدت زيادة تسويقية وحدها', () => {
  const plain = buildQuoteHtml(data());
  expect(plain).not.toContain('class="was"');

  const marked = buildQuoteHtml(
    data({ version: version({ items: [item({ listPriceAgorot: 90000 })] }) }),
  );
  expect(marked).toContain('class="was"');
});
