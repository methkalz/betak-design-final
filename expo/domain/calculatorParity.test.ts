/**
 * تطابق الحاسبة المرسَلة للمالك مع المحرك.
 *
 * الصفحة التي يدقّق بها صاحب المحل تحمل نسختها من الحساب (صفحة مستقلة بلا
 * شبكة). فلو انحرفت عن المحرك أغورةً واحدة لصار التدقيق نفسه كاذبًا: يوافق
 * على أرقام ليست التي سيوقّعها الزبون. هذا الاختبار يمرّ على كل احتمالٍ
 * تعرضه الصفحة - قماشان، ثلاث بطانات، مساران، ثلاثة مضاعفات، شرائح الارتفاع
 * الثلاث، وكميات - ويطابق الطرفين رقمًا برقم.
 *
 * منطق الصفحة منسوخٌ هنا حرفيًا. عند تعديل أيّهما يُنقل النص إلى الآخر.
 */
import { test, expect } from 'bun:test';

import { buildSeed } from '@/data/seed';
import { computeTotals, priceWindow } from './pricing';
import type { TrackType, WindowUnit } from '@/types/domain';

const db = buildSeed();

/* ─── نسخة الصفحة، كما هي في baytak-calculator.html ─── */

function divRoundHalfAway(numer: number, denom: number): number {
  const sign = numer < 0 ? -1 : 1;
  const n = Math.abs(numer);
  const q = Math.floor(n / denom);
  const r = n - q * denom;
  return sign * (r * 2 >= denom ? q + 1 : q);
}
function floorToShekel(agorot: number): number {
  return Math.floor(agorot / 100) * 100;
}
function rmTh(widthCm: number, quantity: number): number {
  return divRoundHalfAway(Math.round(widthCm * 100) * quantity, 10);
}

const S = {
  trackCost: 1000,
  deliveryCost: 1000,
  installCost: 1500,
  motorTrackCost: 10000,
  motorTrackPrice: 20000,
  motorCost: 40000,
  motorPrice: 90000,
  remoteCost: 10000,
  remotePrice: 20000,
  vatPercent: 18,
  oversizePct: 30,
};

/** مرآةُ oversizeRateAgorot في نسخة الصفحة - أعدادٌ صحيحة بحتة. */
function surch(rate: number, heightCm: number): number {
  if (heightCm < 500) return rate;
  return divRoundHalfAway(rate * (10_000 + Math.round(S.oversizePct * 100)), 10_000);
}

const RULES: Record<string, Record<string, [number, number]>> = {
  standard: {
    crepe_with_lining: [29000, 4000],
    crepe_without_lining: [27000, 4000],
    other_with_lining: [35000, 4000],
    other_without_lining: [29000, 4000],
  },
  tall: {
    crepe_with_lining: [45000, 7000],
    crepe_without_lining: [43000, 7000],
    other_with_lining: [51000, 7000],
    other_without_lining: [45000, 7000],
  },
};

const PAGE_FABRICS = [
  { id: 'crg-ow', kind: 'crepe', cost: 1400, sku: 'CRG-OFFWHITE' },
  { id: 'bsh-b', kind: 'other', cost: 2000, sku: 'BSH-BEIGE' },
] as const;

const PAGE_LININGS = [
  { id: 'none', cost: 0, perRm: 0, surcharge: 0, sku: null },
  { id: 'l70', cost: 900, perRm: 3, surcharge: 0, sku: 'LN-70' },
  { id: 'l100', cost: 3000, perRm: 1.5, surcharge: 17000, sku: 'LN-100' },
] as const;

function pagePrice(o: {
  widthCm: number;
  heightCm: number;
  quantity: number;
  fabric: (typeof PAGE_FABRICS)[number];
  lining: (typeof PAGE_LININGS)[number];
  track: TrackType;
  fullness: number;
}) {
  const motor = o.track === 'motorized';
  const hasLining = o.lining.id !== 'none';
  const band = o.heightCm >= 320 ? 'tall' : 'standard';
  const overMax = o.heightCm > 800;
  const cat =
    (o.fabric.kind === 'crepe' ? 'crepe' : 'other') +
    (hasLining ? '_with_lining' : '_without_lining');
  const rule = RULES[band][cat];

  const units = Math.max(1, o.quantity);
  const trackCost = motor ? S.motorTrackCost : S.trackCost;
  const trackPrice = motor ? S.motorTrackPrice : 0;
  const perWinPrice = motor ? (S.motorPrice + S.remotePrice) * units : 0;
  const perWinCost = motor ? (S.motorCost + S.remoteCost) * units : 0;

  const surcharge = hasLining ? o.lining.surcharge : 0;
  // ثلاثةٌ وحدها تُزاد؛ زيادةُ لون البطانة وسعرُ المسار تُجمعان بعدها
  const customerRate = surch(rule[0], o.heightCm);
  const tailorRate = surch(rule[1], o.heightCm);
  const installRate = surch(S.installCost, o.heightCm);
  let unitPrice = customerRate + surcharge + trackPrice;

  const rt = rmTh(o.widthCm, units);
  const fullTh = Math.round(o.fullness * 1000);
  const liningPerRm = hasLining && o.lining.perRm > 0 ? o.lining.perRm : o.fullness;
  const liningMulTh = Math.round(liningPerRm * 1000);

  const fabricTh = divRoundHalfAway(rt * fullTh, 1000);
  const liningTh = hasLining ? divRoundHalfAway(rt * liningMulTh, 1000) : 0;

  let lineTotal = floorToShekel(divRoundHalfAway(unitPrice * rt, 1000)) + perWinPrice;

  const perRmMilli =
    o.fabric.cost * fullTh +
    (hasLining ? o.lining.cost * liningMulTh : 0) +
    (tailorRate + trackCost + S.deliveryCost + installRate) * 1000;
  const internalCost = floorToShekel(divRoundHalfAway(perRmMilli * rt, 1_000_000)) + perWinCost;

  if (overMax) {
    lineTotal = 0;
    unitPrice = 0;
  }

  // بنود التكلفة بمبالغها الكاملة، كما تعرضها ورقة «من أين جاء الربح»
  const whole = (milliPerRm: number) => divRoundHalfAway(milliPerRm * rt, 1_000_000);
  const items = [whole(o.fabric.cost * fullTh)];
  if (hasLining) items.push(whole(o.lining.cost * liningMulTh));
  items.push(whole(tailorRate * 1000), whole(trackCost * 1000));
  items.push(whole(S.deliveryCost * 1000), whole(installRate * 1000));
  if (motor) items.push(S.motorCost * units, S.remoteCost * units);
  const itemsSum = items.reduce((a, b) => a + b, 0);

  return {
    runningMeters: rt / 1000,
    fabricMeters: fabricTh / 1000,
    liningMeters: liningTh / 1000,
    unitPrice,
    lineTotal,
    internalCost,
    itemsSum,
    costRounding: internalCost - itemsSum,
  };
}

function pageTotals(subtotal: number, cost: number, discountPercent: number) {
  const pct = Math.round(discountPercent * 100);
  const vatPct = Math.round(S.vatPercent * 100);
  const drop = (amount: number, hundredths: number) =>
    Math.floor((amount * hundredths) / 1_000_000) * 100;
  const discount = drop(subtotal, pct);
  const revenue = subtotal - discount;
  const vat = drop(revenue, vatPct);
  return {
    net: revenue + vat,
    vat,
    revenue,
    marginPercent:
      revenue > 0 ? divRoundHalfAway((revenue - cost) * 10_000, revenue) / 100 : 0,
  };
}

/* ─── المحرك ─── */

const V = (sku: string) => db.fabricVariants.find((v) => v.sku === sku)!;
const P = (id: string) => db.fabricProducts.find((p) => p.id === id)!;

function enginePrice(o: {
  widthCm: number;
  heightCm: number;
  quantity: number;
  fabricSku: string;
  liningSku: string | null;
  track: TrackType;
  fullness: number;
}) {
  const variant = V(o.fabricSku);
  const lining = o.liningSku ? V(o.liningSku) : null;
  return priceWindow({
    window: {
      id: 'w', organizationId: 'o', projectId: 'p', roomId: 'r', name: 'ش',
      widthCm: o.widthCm, heightCm: o.heightCm, hasLining: !!lining,
      track: o.track, fullness: o.fullness, quantity: o.quantity,
      fabricVariantId: variant.id, liningVariantId: lining?.id ?? null,
      notes: '', measuredAt: null, measuredBy: null,
    } as WindowUnit,
    product: P(variant.productId),
    variant,
    liningVariant: lining,
    rules: db.pricingRules,
    settings: db.settings,
  });
}

const WIDTHS = [100, 165, 320, 427.5];
// حدُّ الشريحة عند 320: الطرفان يُختبران على جانبَي الحدّ نفسه
const HEIGHTS = [240, 319, 320, 499, 500, 501, 799, 800, 801];
const FULLNESS = [2, 2.5, 3];
const QUANTITIES = [1, 3];
const TRACKS: TrackType[] = ['standard', 'motorized'];

test('كل احتمال تعرضه الصفحة يطابق المحرك أغورةً بأغورة', () => {
  let cases = 0;
  for (const fabric of PAGE_FABRICS) {
    for (const lining of PAGE_LININGS) {
      for (const track of TRACKS) {
        for (const fullness of FULLNESS) {
          for (const widthCm of WIDTHS) {
            for (const heightCm of HEIGHTS) {
              for (const quantity of QUANTITIES) {
                const page = pagePrice({
                  widthCm, heightCm, quantity, fabric, lining, track, fullness,
                });
                const eng = enginePrice({
                  widthCm, heightCm, quantity, track, fullness,
                  fabricSku: fabric.sku, liningSku: lining.sku,
                });
                const where =
                  `${fabric.id}/${lining.id}/${track}/×${fullness}/` +
                  `${widthCm}×${heightCm}/${quantity}`;

                expect(`${where} سعر المتر ${page.unitPrice}`).toBe(
                  `${where} سعر المتر ${eng.unitPriceAgorot}`,
                );
                expect(`${where} الإجمالي ${page.lineTotal}`).toBe(
                  `${where} الإجمالي ${eng.lineTotalAgorot}`,
                );
                expect(`${where} الأمتار ${page.runningMeters}`).toBe(
                  `${where} الأمتار ${eng.runningMeters}`,
                );
                expect(`${where} القماش ${page.fabricMeters}`).toBe(
                  `${where} القماش ${eng.fabricMeters}`,
                );
                expect(`${where} البطانة ${page.liningMeters}`).toBe(
                  `${where} البطانة ${eng.liningMeters}`,
                );
                // فوق ٥٠٠ سم يمتنع المحرك عن التسعير كله، فالتكلفة عنده صفر
                if (heightCm <= 800) {
                  expect(`${where} التكلفة ${page.internalCost}`).toBe(
                    `${where} التكلفة ${eng.internalCostAgorot}`,
                  );
                }
                // العمود الذي يقرأه المالك يجب أن يجمع إلى الرقم نفسه: البنود
                // مفردةً + سطر تنزيل الكسر = التكلفة المعروضة، بلا استثناء
                expect(`${where} جمع البنود ${page.itemsSum + page.costRounding}`).toBe(
                  `${where} جمع البنود ${page.internalCost}`,
                );
                // ولا يزيد التنزيل عن شيكل واحد، وإلا فالبنود نفسها منحرفة
                expect(`${where} التنزيل ${Math.abs(page.costRounding) < 100}`).toBe(
                  `${where} التنزيل true`,
                );
                cases++;
              }
            }
          }
        }
      }
    }
  }
  // 4 عروض × 9 ارتفاعات × 3 امتلاء × 2 كمية × 2 مسار × (2 قماش × 3 بطانة)
  // حرفيٌّ لا محسوب: إسقاط بُعدٍ سهوًا يجب أن يُسقط البوابة لا أن يمرّ
  expect(cases).toBe(2592);
});

test('الخصم والضريبة والهامش في الصفحة تطابق تجميع المحرك', () => {
  for (const discount of [0, 3, 5, 10, 20]) {
    const eng = enginePrice({
      widthCm: 320, heightCm: 280, quantity: 2, track: 'motorized',
      fullness: 3, fabricSku: 'BSH-BEIGE', liningSku: 'LN-100',
    });
    const engTotals = computeTotals(
      [{ lineTotalAgorot: eng.lineTotalAgorot, internalCostAgorot: eng.internalCostAgorot }],
      discount,
      db.settings,
    );
    const page = pageTotals(eng.lineTotalAgorot, eng.internalCostAgorot, discount);

    expect([discount, page.net]).toEqual([discount, engTotals.totalAgorot]);
    expect([discount, page.vat]).toEqual([discount, engTotals.vatAgorot]);
    // الإيراد الصافي غير معروض في `QuotationTotals`، فيُشتقّ كما تشتقّه الشاشات
    expect([discount, page.revenue]).toEqual([
      discount,
      engTotals.totalAgorot - engTotals.vatAgorot,
    ]);
    expect([discount, page.revenue - eng.internalCostAgorot]).toEqual([
      discount,
      engTotals.marginAgorot,
    ]);
    expect([discount, page.marginPercent]).toEqual([discount, engTotals.marginPercent]);
  }
});

/**
 * حارسُ انحرافِ الحاسبة المستقلّة.
 *
 * `pagePrice` أعلاه **نسخةٌ يدوية** من منطق صفحة الحاسبة، لا استيرادٌ منها.
 * فلو عُدِّل المحرّك والنسخة اليدوية وحدهما، بقيت الحاسبة الحقيقية تسعّر
 * بالقديم والبوابةُ خضراء - والمالك يستعملها أمام الزبون. هذا الفحص رخيص
 * ويحوّل الانحراف الصامت إلى بناءٍ أحمر.
 */
test('نسختا الحاسبة المستقلّة تحملان القاعدة نفسها', async () => {
  const files = ['tools/price-calculator/app.js', 'tools/price-calculator.html'];
  for (const f of files) {
    const src = await Bun.file(f).text();
    expect(`${f}: يعرف نسبة الزيادة`).toBe(
      src.includes('oversizePct') ? `${f}: يعرف نسبة الزيادة` : `${f}: يجهل الزيادة`,
    );
    expect(`${f}: السقف 800`).toBe(
      src.includes('heightCm > 800') ? `${f}: السقف 800` : `${f}: السقف ما زال 500`,
    );
    expect(`${f}: الحدّ 500`).toBe(
      src.includes('heightCm < 500') ? `${f}: الحدّ 500` : `${f}: بلا حدّ 500`,
    );
  }
});
