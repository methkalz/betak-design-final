/**
 * Golden pricing vectors — TS side of the §10 point-5 contract.
 * The same vectors are asserted against SQL numeric arithmetic in
 * supabase/tests/golden_pricing_vectors.py. Any single-agora difference
 * between the two sides fails the CI gate. Run with `bun test`.
 * (Excluded from tsc via tsconfig "exclude" — bun:test types are bun's.)
 */
import { test, expect } from 'bun:test';
import { lineArithmetic, totalsArithmetic } from './pricing';
import vectors from './pricing.vectors.json';

const S = vectors.settings;

for (const v of vectors.vectors) {
  test(`vector: ${v.name}`, () => {
    const line = lineArithmetic({
      widthCm: v.input.widthCm,
      quantity: v.input.quantity,
      fullness: v.input.fullness,
      hasLining: v.input.hasLining,
      unitPriceAgorot: v.input.unitPriceAgorot,
      tailorCostAgorot: v.input.tailorCostAgorot,
      fabricCostAgorot: v.input.fabricCostAgorot,
      liningCostAgorot: v.input.liningCostAgorot,
      trackCostAgorot: S.trackCostPerMeterAgorot,
      deliveryCostAgorot: S.deliveryCostPerMeterAgorot,
      measureInstallCostAgorot: S.measureInstallCostPerMeterAgorot,
    });

    expect(line.runningMeters).toBe(v.expected.runningMeters);
    expect(line.fabricMeters).toBe(v.expected.fabricMeters);
    expect(line.liningMeters).toBe(v.expected.liningMeters);
    expect(line.lineTotalAgorot).toBe(v.expected.lineTotalAgorot);
    expect(line.internalCostAgorot).toBe(v.expected.internalCostAgorot);

    const t = totalsArithmetic(
      line.lineTotalAgorot,
      line.internalCostAgorot,
      v.input.discountPercent,
      S.vatPercent,
    );
    expect(t.subtotalAgorot).toBe(v.expected.subtotalAgorot);
    expect(t.discountAgorot).toBe(v.expected.discountAgorot);
    expect(t.totalAgorot).toBe(v.expected.totalAgorot);
    expect(t.vatAgorot).toBe(v.expected.vatAgorot);
    expect(t.revenueExVatAgorot).toBe(v.expected.revenueExVatAgorot);
    expect(t.marginPercent).toBe(v.expected.marginPercent);
  });
}
