/**
 * تقرير الاستهلاك - المخطط مقابل الفعلي.
 *
 * سجلات استهلاكٍ مُركَّبة بتواريخ نسبية من «الآن»، فتُختبر الدوال على أشهرها:
 * التجميع الشهري، والزيادة الموجبة وحدها، وترتيب الشواذ، ونافذة الثلاثين يومًا
 * التي تغذّي بلاطة المخزون.
 *
 * ★ الساعة مثبَّتة على منتصف شهر: الدوال تقرأ الشهر الجاري من الساعة، فلو بقيت
 * حرّة لوقع «قبل يومين» في الشهر السابق كلّ أوّلِ شهر - وهكذا سقط CI في 1.10.2026.
 * منتصف الشهر ظهرًا يُبقي كلّ تاريخٍ هنا في شهره بأيّ منطقةٍ زمنية.
 */
import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test';

import { buildSeed } from '@/data/seed';
import { consumedInLastDays } from './inventory';
import {
  consumptionOverruns,
  monthConsumptionByVariant,
  monthlyConsumption,
} from './reports';
import type { FabricUsage, StockMovement } from '@/types/domain';

beforeAll(() => setSystemTime(new Date('2026-06-15T12:00:00.000Z')));
afterAll(() => setSystemTime());

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function usage(over: Partial<FabricUsage>): FabricUsage {
  return {
    id: `u-${Math.abs(JSON.stringify(over).length)}-${over.createdAt}`,
    organizationId: 'org-baytak',
    projectId: 'prj-1041',
    windowId: 'win-1041-1',
    reservationId: 'res-x',
    rollId: 'roll-cr101',
    plannedM: 5,
    actualM: 5,
    wasteM: 0,
    notes: '',
    createdBy: 'usr-abudani',
    createdAt: daysAgo(3),
    ...over,
  };
}

test('التجميع الشهري: المخطط والفعلي يقعان في شهر السجل، والزيادة موجبة فقط', () => {
  const db = buildSeed();
  db.usages = [
    usage({ plannedM: 10, actualM: 12, createdAt: daysAgo(2) }), // +2 هذا الشهر
    usage({ plannedM: 8, actualM: 6, createdAt: daysAgo(2) }),   // أقل من المخطط - لا «زيادة»
  ];
  const months = monthlyConsumption(db, 6);
  const current = months[months.length - 1];
  expect(months.length).toBe(6);
  expect(current.plannedM).toBe(18);
  expect(current.actualM).toBe(18);
  // الزيادة تُجمع من السجلات الزائدة وحدها - النقص في سجلٍ لا يطفئ زيادة غيره
  expect(current.overM).toBe(2);
});

test('الشواذ: الزائد وحده يُسرد، والأكبر أولًا، والنسبة على مخططه', () => {
  const db = buildSeed();
  db.usages = [
    usage({ plannedM: 10, actualM: 11, notes: 'قصّة معادة', createdAt: daysAgo(5) }),
    usage({ plannedM: 4, actualM: 6, notes: 'تلف حافة', createdAt: daysAgo(4) }),
    usage({ plannedM: 9, actualM: 9, createdAt: daysAgo(3) }), // مطابق - لا يُسرد
  ];
  const rows = consumptionOverruns(db, 30);
  expect(rows.length).toBe(2);
  expect(rows[0].overM).toBe(2); // الأكبر مترًا يتصدر
  expect(rows[0].overPct).toBe(50);
  expect(rows[0].notes).toBe('تلف حافة');
  expect(rows[1].overM).toBe(1);
  expect(rows[1].overPct).toBe(10);
});

test('حسب الصنف: السجل يُنسب لصنف رولّه، هذا الشهرَ فقط', () => {
  const db = buildSeed();
  const anyRoll = db.fabricRolls[0];
  db.usages = [
    usage({ rollId: anyRoll.id, actualM: 7, createdAt: daysAgo(1) }),
    usage({ rollId: anyRoll.id, actualM: 60, createdAt: daysAgo(45) }), // شهرٌ آخر
  ];
  const rows = monthConsumptionByVariant(db);
  // الساعة مثبَّتة، فلا حاجة لاحتمال «الشهر الجاري فارغ» - الـ60 مترًا خارجه حتمًا
  const total = rows.reduce((s, r) => s + r.meters, 0);
  expect(total).toBe(7);
  expect(rows[0].variantId).toBe(anyRoll.variantId);
  expect(rows[0].name.length).toBeGreaterThan(0);
});

test('نافذة الثلاثين يومًا: يدخلها الاستهلاك والزيادة، ويخرج ما قبلها والحجز', () => {
  const db = buildSeed();
  const mv = (over: Partial<StockMovement>): StockMovement => ({
    id: `m-${over.createdAt}-${over.type}`,
    organizationId: 'org-baytak',
    rollId: 'roll-cr101',
    type: 'consumption',
    quantityM: 5,
    projectId: null,
    reservationId: null,
    notes: '',
    createdBy: 'usr-abudani',
    createdAt: daysAgo(3),
    idempotencyKey: `k-${over.createdAt}-${over.type}`,
    ...over,
  });
  db.stockMovements = [
    mv({ quantityM: 5, createdAt: daysAgo(3) }),
    mv({ type: 'overconsumption', quantityM: 1.5, createdAt: daysAgo(3) }),
    mv({ quantityM: 99, createdAt: daysAgo(31) }), // خارج النافذة
    mv({ type: 'reservation', quantityM: 40, createdAt: daysAgo(1) }), // حجزٌ لا استهلاك
  ];
  expect(consumedInLastDays(db.stockMovements, 30)).toBe(6.5);
});
