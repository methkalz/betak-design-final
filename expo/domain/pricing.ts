/**
 * Pricing engine — implements the documented per-window pricing rules.
 *
 * Pricing is calculated per window (running meters × price band), then the
 * lines are aggregated into a single quotation version.
 */

import type {
  BusinessSettings,
  FabricProduct,
  FabricVariant,
  HeightBand,
  PricingCategory,
  PricingRule,
  QuotationItem,
  WindowUnit,
} from '@/types/domain';

export const TALL_BAND_MIN_CM = 330;
export const TALL_BAND_MAX_CM = 500;

export function resolveBand(heightCm: number): HeightBand {
  return heightCm >= TALL_BAND_MIN_CM ? 'tall' : 'standard';
}

export function resolveCategory(kind: 'crepe' | 'other', hasLining: boolean): PricingCategory {
  if (kind === 'crepe') return hasLining ? 'crepe_with_lining' : 'crepe_without_lining';
  return hasLining ? 'other_with_lining' : 'other_without_lining';
}

/**
 * §10 rounding contract: SQL `numeric` is the sole financial authority.
 * This preview mirrors it with EXACT integer arithmetic — meters as integer
 * thousandths, money as integer agorot, fullness as integer thousandths —
 * so every division below is integer division with explicit half-away-from-
 * zero rounding, identical to PostgreSQL round(numeric). No float division
 * touches any financial figure. All intermediates stay far below
 * Number.MAX_SAFE_INTEGER for realistic shop ranges (price ≤ 10^7 agorot,
 * meters ≤ 10^3, fullness ≤ 10). Shared golden vectors
 * (pricing.vectors.json) are asserted against BOTH this file and SQL in CI.
 */
function divRoundHalfAway(numer: number, denom: number): number {
  const sign = numer < 0 ? -1 : 1;
  const n = Math.abs(numer);
  const q = Math.floor(n / denom);
  const r = n - q * denom;
  return sign * (r * 2 >= denom ? q + 1 : q);
}

/** Running meters as integer thousandths: round3(widthCm/100 × quantity). */
function runningMetersThousandths(widthCm: number, quantity: number): number {
  const widthHundredthsCm = Math.round(widthCm * 100); // width has ≤2dp by contract
  return divRoundHalfAway(widthHundredthsCm * quantity, 10);
}

/** Running meters of finished curtain for one window (width only). */
export function runningMeters(widthCm: number, quantity: number): number {
  return runningMetersThousandths(widthCm, quantity) / 1000;
}

/** Fabric consumed = running meters × fullness multiplier. */
export function fabricMeters(widthCm: number, quantity: number, fullness: number): number {
  const rmTh = runningMetersThousandths(widthCm, quantity);
  const fullnessTh = Math.round(fullness * 1000);
  // thousandths × thousandths ÷ 1000 → thousandths (round3 of rm × fullness)
  return divRoundHalfAway(rmTh * fullnessTh, 1000) / 1000;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface LineArithmeticInput {
  widthCm: number;
  quantity: number;
  fullness: number;
  hasLining: boolean;
  unitPriceAgorot: number;
  tailorCostAgorot: number;
  fabricCostAgorot: number;
  liningCostAgorot: number;
  trackCostAgorot: number;
  deliveryCostAgorot: number;
  measureInstallCostAgorot: number;
}

export interface LineArithmeticResult {
  runningMeters: number;
  fabricMeters: number;
  liningMeters: number;
  lineTotalAgorot: number;
  internalCostAgorot: number;
  /** milli-agorot per running meter, unrounded — display rounds per line. */
  costPerRunningMeterMilli: number;
}

/**
 * The per-window arithmetic core (§10 هـ) — the exact mirror of
 * private.price_project_windows: the customer rate multiplies billable
 * running meters only; the consumption multiplier touches fabric quantity
 * and cost only; cost-per-running-meter stays unrounded until the single
 * per-line rounding.
 */
export function lineArithmetic(i: LineArithmeticInput): LineArithmeticResult {
  const rmTh = runningMetersThousandths(i.widthCm, i.quantity);
  const fullnessTh = Math.round(i.fullness * 1000);
  // thousandths × thousandths ÷ 1000 → thousandths (round3 of rm × fullness)
  const fabricTh = divRoundHalfAway(rmTh * fullnessTh, 1000);
  const liningTh = i.hasLining ? fabricTh : 0;

  const lineTotalAgorot = divRoundHalfAway(i.unitPriceAgorot * rmTh, 1000);

  const costPerRunningMeterMilli =
    i.fabricCostAgorot * fullnessTh +
    (i.hasLining ? i.liningCostAgorot * fullnessTh : 0) +
    (i.tailorCostAgorot + i.trackCostAgorot + i.deliveryCostAgorot + i.measureInstallCostAgorot) * 1000;

  const internalCostAgorot = divRoundHalfAway(costPerRunningMeterMilli * rmTh, 1_000_000);

  return {
    runningMeters: rmTh / 1000,
    fabricMeters: fabricTh / 1000,
    liningMeters: liningTh / 1000,
    lineTotalAgorot,
    internalCostAgorot,
    costPerRunningMeterMilli,
  };
}

export interface TotalsArithmeticResult {
  subtotalAgorot: number;
  discountAgorot: number;
  vatAgorot: number;
  totalAgorot: number;
  revenueExVatAgorot: number;
  marginPercent: number;
}

/**
 * Aggregation under the owner's VAT-inclusive policy (§10 هـ):
 * total = net; VAT is extracted (never added on top); margin is measured
 * against VAT-exclusive revenue.
 */
export function totalsArithmetic(
  subtotalAgorot: number,
  internalCostAgorot: number,
  discountPercent: number,
  vatPercent: number,
): TotalsArithmeticResult {
  const pctHundredths = Math.round(discountPercent * 100);
  const vatHundredths = Math.round(vatPercent * 100);

  const discountAgorot = divRoundHalfAway(subtotalAgorot * pctHundredths, 10_000);
  const net = subtotalAgorot - discountAgorot;
  const revenueExVatAgorot = divRoundHalfAway(net * 10_000, 10_000 + vatHundredths);
  const vatAgorot = net - revenueExVatAgorot;
  const marginPercent =
    revenueExVatAgorot > 0
      ? divRoundHalfAway((revenueExVatAgorot - internalCostAgorot) * 10_000, revenueExVatAgorot) / 100
      : 0;

  return {
    subtotalAgorot,
    discountAgorot,
    vatAgorot,
    totalAgorot: net,
    revenueExVatAgorot,
    marginPercent,
  };
}

export interface PriceBreakdownLine {
  label: string;
  detail: string;
  amountAgorot: number;
}

export interface WindowPricing {
  band: HeightBand;
  category: PricingCategory;
  runningMeters: number;
  fabricMeters: number;
  liningMeters: number;
  unitPriceAgorot: number;
  lineTotalAgorot: number;
  internalCostAgorot: number;
  /** Internal-only breakdown — admin / authorised sales users only. */
  costLines: PriceBreakdownLine[];
  marginAgorot: number;
  marginPercent: number;
  warnings: string[];
}

interface PriceInput {
  window: WindowUnit;
  product: FabricProduct | null;
  variant: FabricVariant | null;
  liningVariant: FabricVariant | null;
  rules: PricingRule[];
  settings: BusinessSettings;
}

export function findRule(
  rules: PricingRule[],
  band: HeightBand,
  category: PricingCategory,
): PricingRule | null {
  return rules.find((r) => r.band === band && r.category === category) ?? null;
}

/**
 * Computes customer price and internal cost for a single window.
 * Internal cost = (fabric + lining) × fullness + tailor + track + delivery + measure/install,
 * each expressed per running meter, exactly as documented.
 */
export function priceWindow(input: PriceInput): WindowPricing {
  const { window: win, product, variant, liningVariant, rules, settings } = input;
  const warnings: string[] = [];

  const band = resolveBand(win.heightCm);
  if (win.heightCm > TALL_BAND_MAX_CM) {
    warnings.push('الارتفاع يتجاوز 500 سم — يحتاج تسعيرة خاصة من الأدمن.');
  }
  const kind: 'crepe' | 'other' = product?.kind === 'crepe' ? 'crepe' : 'other';
  const category = resolveCategory(kind, win.hasLining);
  const rule = findRule(rules, band, category);

  if (!rule) {
    warnings.push('لا توجد قاعدة تسعير مطابقة — راجع إعدادات التسعير.');
  }

  const unitPriceAgorot = rule?.customerPricePerMeterAgorot ?? 0;
  const fabricCostPerM = variant?.costPerMeterAgorot ?? 0;
  const liningCostPerM = liningVariant?.costPerMeterAgorot ?? settings.liningCostPerMeterAgorot;

  const line = lineArithmetic({
    widthCm: win.widthCm,
    quantity: win.quantity,
    fullness: win.fullness,
    hasLining: win.hasLining,
    unitPriceAgorot,
    tailorCostAgorot: rule?.tailorCostPerMeterAgorot ?? 0,
    fabricCostAgorot: fabricCostPerM,
    liningCostAgorot: liningCostPerM,
    trackCostAgorot: settings.trackCostPerMeterAgorot,
    deliveryCostAgorot: settings.deliveryCostPerMeterAgorot,
    measureInstallCostAgorot: settings.measureInstallCostPerMeterAgorot,
  });
  const rm = line.runningMeters;
  const fm = line.fabricMeters;
  const lm = line.liningMeters;
  const lineTotalAgorot = line.lineTotalAgorot;
  const internalCostAgorot = line.internalCostAgorot;
  const fullnessTh = Math.round(win.fullness * 1000);

  const costLines: PriceBreakdownLine[] = [
    {
      label: product?.name ?? 'القماش',
      detail: `${(fabricCostPerM / 100).toFixed(0)} × ${win.fullness}`,
      amountAgorot: divRoundHalfAway(fabricCostPerM * fullnessTh, 1000),
    },
  ];
  if (win.hasLining) {
    costLines.push({
      label: 'البطانة',
      detail: `${(liningCostPerM / 100).toFixed(0)} × ${win.fullness}`,
      amountAgorot: divRoundHalfAway(liningCostPerM * fullnessTh, 1000),
    });
  }
  costLines.push({
    label: 'الخياط',
    detail: band === 'standard' ? 'ارتفاع عادي' : 'ارتفاع عالٍ',
    amountAgorot: rule?.tailorCostPerMeterAgorot ?? 0,
  });
  costLines.push({
    label: 'المسار',
    detail: 'لكل متر ركض',
    amountAgorot: settings.trackCostPerMeterAgorot,
  });
  costLines.push({
    label: 'التوصيل',
    detail: 'لكل متر ركض',
    amountAgorot: settings.deliveryCostPerMeterAgorot,
  });
  costLines.push({
    label: 'القياس والتركيب',
    detail: 'لكل متر ركض',
    amountAgorot: settings.measureInstallCostPerMeterAgorot,
  });

  // Owner decision (2026-08-03): customer prices are FINAL, VAT-inclusive.
  // Margin is always measured against VAT-exclusive revenue — measuring it
  // against the inclusive price overstates it and hides min-margin breaches.
  const lineTotals = totalsArithmetic(lineTotalAgorot, internalCostAgorot, 0, settings.vatPercent);
  const marginAgorot = lineTotals.revenueExVatAgorot - internalCostAgorot;
  const marginPercent = lineTotals.marginPercent;

  if (marginPercent < settings.minMarginPercent && lineTotalAgorot > 0) {
    warnings.push('هامش الربح لهذا البند أقل من الحد الأدنى المسموح.');
  }

  return {
    band,
    category,
    runningMeters: rm,
    fabricMeters: fm,
    liningMeters: lm,
    unitPriceAgorot,
    lineTotalAgorot,
    internalCostAgorot,
    costLines,
    marginAgorot,
    marginPercent: Math.round(marginPercent * 100) / 100,
    warnings,
  };
}

export interface QuotationTotals {
  subtotalAgorot: number;
  discountAgorot: number;
  vatAgorot: number;
  totalAgorot: number;
  internalCostAgorot: number;
  marginAgorot: number;
  marginPercent: number;
}

export function computeTotals(
  items: QuotationItem[],
  discountPercent: number,
  settings: BusinessSettings,
): QuotationTotals {
  const subtotalAgorot = items.reduce((s, i) => s + i.lineTotalAgorot, 0);
  const internalCostAgorot = items.reduce((s, i) => s + i.internalCostAgorot, 0);
  // Owner decision (2026-08-03): prices are VAT-inclusive. The customer pays
  // `net` as-is; VAT is extracted from it for reporting/PDF, never added on
  // top. Margin compares VAT-exclusive revenue to internal cost.
  const t = totalsArithmetic(subtotalAgorot, internalCostAgorot, discountPercent, settings.vatPercent);
  return {
    subtotalAgorot,
    discountAgorot: t.discountAgorot,
    vatAgorot: t.vatAgorot,
    totalAgorot: t.totalAgorot,
    internalCostAgorot,
    marginAgorot: t.revenueExVatAgorot - internalCostAgorot,
    marginPercent: t.marginPercent,
  };
}

export type DiscountAuthority = 'allowed' | 'needs_admin' | 'forbidden';

export function discountAuthority(
  discountPercent: number,
  settings: BusinessSettings,
): DiscountAuthority {
  if (discountPercent <= settings.employeeDiscountLimitPercent) return 'allowed';
  if (discountPercent <= settings.adminDiscountLimitPercent) return 'needs_admin';
  return 'forbidden';
}

export interface DiscountCheck {
  authority: DiscountAuthority;
  belowMinMargin: boolean;
  message: string;
}

export function checkDiscount(
  items: QuotationItem[],
  discountPercent: number,
  settings: BusinessSettings,
): DiscountCheck {
  const authority = discountAuthority(discountPercent, settings);
  const totals = computeTotals(items, discountPercent, settings);
  const belowMinMargin = totals.marginPercent < settings.minMarginPercent;
  let message = 'الخصم ضمن صلاحية الموظف.';
  if (authority === 'needs_admin') message = 'الخصم يتطلب موافقة الأدمن.';
  if (authority === 'forbidden')
    message = `خصم أكثر من ${settings.adminDiscountLimitPercent}% ممنوع إلا بـ Override موثق من الأدمن.`;
  if (belowMinMargin)
    message = `السعر النهائي ينزل تحت هامش الربح الأدنى (${settings.minMarginPercent}%).`;
  return { authority, belowMinMargin, message };
}
