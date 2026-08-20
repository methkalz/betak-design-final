/**
 * حراسة المسار عند حدّ الخصم (PR-E، تصليح التدقيق العدائي).
 *
 * العطب الأصلي: الشاشة كانت تقرّر الصلاحية بخانتين عشريّتين لكن تُرسل الطلب
 * بخانةٍ واحدة. فخصمٌ نسبتُه المشتقّة (2 خانة) تتجاوز حدّ الموظف بينما تقريبها
 * لخانةٍ واحدة يقف عند الحدّ = مأزق: البوابة تقول «يلزم الأدمن» والخادم يرفض
 * الطلب «ضمن الصلاحية». التصليح وحّد الاشتقاق في `derivedDiscountPercent`،
 * فالنسبة التي تُرسَل هي عينها التي قرّرت البوابة والتي يخزّنها الخادم.
 *
 * الثابتة المحروسة: كلّما رأت الشاشةُ الخصمَ «فوق صلاحية الموظف»، فالنسبة
 * المشتقّة (وهي ما يخزّنه الخادم على النسخة وما تقيسه بوابة request_discount)
 * أكبرُ فعلًا من حدّ الموظف — فلا يُرفض الطلب. ولا خسارةَ في المبلغ: المبلغ
 * المطلق يُحفظ كما هو، لا يُعاد اشتقاقه من نسبةٍ مبتورة.
 */
import { expect, test } from 'bun:test';

import {
  checkDiscountAgorot,
  computeTotalsFromDiscountAgorot,
  derivedDiscountPercent,
  discountAuthority,
} from '@/domain/pricing';
import type { BusinessSettings, QuotationItem } from '@/types/domain';

const SETTINGS = {
  vatPercent: 18,
  minMarginPercent: 35,
  employeeDiscountLimitPercent: 5,
  adminDiscountLimitPercent: 10,
} as unknown as BusinessSettings;

const EMP = SETTINGS.employeeDiscountLimitPercent;

// بندٌ واحد بمجموعٍ محدَّد وتكلفةٍ صفر (فالهامش دائمًا مرتفع، فلا يتدخّل حدُّه
// في قرار الصلاحية الذي نختبره).
const itemsWithSubtotal = (subtotalAgorot: number): QuotationItem[] =>
  [{ category: 'x', lineTotalAgorot: subtotalAgorot, internalCostAgorot: 0 }] as unknown as QuotationItem[];

// مجاميع تشمل الكبيرة (حيث كان تقريب الخانة الواحدة يفرّق شيكلًا) والصغيرة.
const SUBTOTALS = [58000, 99900, 123400, 165800, 250000, 1000000, 5000000];

test('لا مأزق عند الحدّ: كلّ خصمٍ يراه المستخدم «فوق الصلاحية» يقبله الخادم فعلًا', () => {
  for (const S of SUBTOTALS) {
    const items = itemsWithSubtotal(S);
    const maxD = Math.floor((S * 0.2) / 100) * 100; // سقف العصا 20٪، بالشيكل
    for (let D = 0; D <= maxD; D += 100) {
      // بالشيكل
      const pct = derivedDiscountPercent(D, S); // ما تُرسله الشاشة ويخزّنه الخادم
      const auth = checkDiscountAgorot(items, D, SETTINGS).authority;

      // (١) قرار الشاشة = قرار النسبة المشتّقة نفسها (مصدرٌ واحد، لا انزلاق).
      expect(auth).toBe(discountAuthority(pct, SETTINGS));

      // (٢) المأزق ممنوع: «يلزم موافقة» مع نسبةٍ ≤ حدّ الموظف (يرفضها الخادم).
      const deadlock = auth !== 'allowed' && pct <= EMP;
      expect(deadlock).toBe(false);
    }
  }
});

test('المبلغ المطلق يُحفظ بالضبط (لا يُعاد اشتقاقه من نسبةٍ مبتورة)', () => {
  for (const S of SUBTOTALS) {
    const items = itemsWithSubtotal(S);
    for (const D of [8000, 12600, 65500, 322300]) {
      if (D > S) continue;
      const totals = computeTotalsFromDiscountAgorot(items, D, SETTINGS.vatPercent);
      expect(totals.discountAgorot).toBe(D); // بلا خسارة أغورةٍ واحدة
      expect(totals.revenueExVatAgorot).toBe(S - D);
    }
  }
});

test('حالة العطب الأصلية المحدّدة: 99900 وخصم 50₪ لم تعد مأزقًا', () => {
  // نسبةٌ حقيقية 5.005٪ → خانتان = 5.01 (فوق الحدّ، يلزم الأدمن)،
  // بينما خانةٌ واحدة قديمًا = 5.0 (يرفضها الخادم «ضمن الصلاحية») = مأزق.
  const items = itemsWithSubtotal(99900);
  const pct = derivedDiscountPercent(5000, 99900);
  expect(pct).toBe(5.01);
  expect(checkDiscountAgorot(items, 5000, SETTINGS).authority).toBe('needs_admin');
  expect(pct).toBeGreaterThan(EMP); // الخادم يقبل الطلب، لا مأزق
});
