/**
 * البذرة تُبنى فعلًا - فحصٌ لا يقوم به `tsc`.
 *
 * `buildSeed` تُشغّل محرك التسعير على كل شباك وتبني العروض والحجوزات
 * والدفعات مترابطة. خطأُ مرجعٍ فيها (لون حُذف، منتج أُعيد تسميته) لا يظهر
 * في الأنواع بل ينفجر عند أول فتح للتطبيق. هذا الاختبار يفتحه هنا.
 */
import { test, expect } from 'bun:test';

import { buildSeed } from './seed';

const db = buildSeed();

test('البذرة تُبنى وتحمل الكتالوج المعتمد فقط', () => {
  expect(db.fabricProducts.map((p) => p.name).sort()).toEqual(['بشتان', 'بطانة', 'كريب جورجيت']);
  const crepe = db.fabricVariants.filter(
    (v) => v.productId === db.fabricProducts.find((p) => p.name === 'كريب جورجيت')?.id,
  );
  expect(crepe.map((v) => v.colorName).sort()).toEqual(['أبيض', 'أوف وايت']);
  const bashtan = db.fabricVariants.filter(
    (v) => v.productId === db.fabricProducts.find((p) => p.name === 'بشتان')?.id,
  );
  expect(bashtan.map((v) => v.colorName).sort()).toEqual(['أبيض', 'أوف وايت', 'بيج']);
});

test('البطانة درجتان، و100% وحدها تحمل زيادة السعر', () => {
  const l70 = db.fabricVariants.find((v) => v.sku === 'LN-70');
  const l100 = db.fabricVariants.find((v) => v.sku === 'LN-100');
  expect(l70?.customerSurchargePerMeterAgorot).toBe(0);
  expect(l100?.customerSurchargePerMeterAgorot).toBe(17000);
});

test('لا مرجع معلّق: كل شباك ورول يشير إلى صنف موجود', () => {
  const ids = new Set(db.fabricVariants.map((v) => v.id));
  for (const w of db.windows) {
    if (w.fabricVariantId) expect(ids.has(w.fabricVariantId)).toBe(true);
    if (w.liningVariantId) expect(ids.has(w.liningVariantId)).toBe(true);
  }
  for (const r of db.fabricRolls) expect(ids.has(r.variantId)).toBe(true);
});

test('كل قماش غير البطانة بلا زيادة - لا سعر يرتفع بلا قرار', () => {
  const lining = db.fabricProducts.find((p) => p.kind === 'lining')?.id;
  const others = db.fabricVariants.filter((v) => v.productId !== lining);
  expect(others.every((v) => v.customerSurchargePerMeterAgorot === 0)).toBe(true);
});
