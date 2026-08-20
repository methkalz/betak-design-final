/**
 * حساب الزيادة التسويقية (list_price) - مرآةٌ حرفية لِما يحسبه الخادم.
 *
 * عرضٌ فقط: يُظهر «قبل» أعلى السعر الحقيقي، ولا يمسّ ما يُدفع. الأرقام هنا
 * يجب أن تطابق الـRPC بتّيًا (النسبة تُبتر إلى الشيكل، والمبلغ بالشيكل يُضاف).
 */
import { expect, test } from 'bun:test';

import { anchorSubtotalAgorot, markupListPriceAgorot } from '@/domain/pricing';
import type { MarkupSpec, QuotationItem } from '@/types/domain';

const M = (mode: 'percent' | 'amount', targets: Record<string, number>): MarkupSpec => ({ mode, targets });

test('نسبة على تصنيفٍ بعينه: 1740 + 15% = 2001', () => {
  // 1740 * 115 / 100 = 2001 (صحيحٌ بالفعل، لا بتر)
  expect(markupListPriceAgorot(174000, 'crepe_with_lining', M('percent', { crepe_with_lining: 15 }))).toBe(200100);
});

test('النسبة تُبتر إلى الشيكل: 1305 + 15% = 1500.75 → 1500', () => {
  // 130500 * 115 / 100 = 150075 → round(1500.75)=1501 أغورة؟ لا: الأغورة ثم البتر للشيكل
  // divRoundHalfAway(130500*115, 100) = round(150075) = 150075، ثم floorToShekel = 150000
  expect(markupListPriceAgorot(130500, 'crepe_without_lining', M('percent', { crepe_without_lining: 15 }))).toBe(150000);
});

test('مبلغ ثابت: 1740 + 200₪ = 1940', () => {
  expect(markupListPriceAgorot(174000, 'other_with_lining', M('amount', { other_with_lining: 200 }))).toBe(194000);
});

test('«all» يطال كل تصنيفٍ لم يُحدَّد', () => {
  expect(markupListPriceAgorot(100000, 'crepe_with_lining', M('percent', { all: 10 }))).toBe(110000);
  // تصنيفٌ محدَّد يغلب «all»
  expect(markupListPriceAgorot(100000, 'crepe_with_lining', M('percent', { all: 10, crepe_with_lining: 20 }))).toBe(120000);
});

test('بلا زيادة على التصنيف → صفر (لا مرساة)', () => {
  expect(markupListPriceAgorot(100000, 'other_without_lining', M('percent', { crepe_with_lining: 15 }))).toBe(0);
  expect(markupListPriceAgorot(100000, 'x', null)).toBe(0);
  expect(markupListPriceAgorot(100000, 'x', { mode: 'percent', targets: {} })).toBe(0);
});

test('مجموع المرساة: المُضخَّم حيث وُجد وإلا الحقيقي', () => {
  const items = [
    { category: 'crepe_with_lining', lineTotalAgorot: 174000, listPriceAgorot: 200100 },
    { category: 'crepe_without_lining', lineTotalAgorot: 130500, listPriceAgorot: 0 },
  ] as unknown as QuotationItem[];
  expect(anchorSubtotalAgorot(items)).toBe(200100 + 130500);
});
