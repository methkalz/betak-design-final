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

/** Running meters of finished curtain for one window (width only). */
export function runningMeters(widthCm: number, quantity: number): number {
  return round3((widthCm / 100) * quantity);
}

/** Fabric consumed = running meters × fullness multiplier. */
export function fabricMeters(widthCm: number, quantity: number, fullness: number): number {
  return round3(runningMeters(widthCm, quantity) * fullness);
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
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

  const rm = runningMeters(win.widthCm, win.quantity);
  const fm = fabricMeters(win.widthCm, win.quantity, win.fullness);
  const lm = win.hasLining ? fm : 0;

  if (!rule) {
    warnings.push('لا توجد قاعدة تسعير مطابقة — راجع إعدادات التسعير.');
  }

  const unitPriceAgorot = rule?.customerPricePerMeterAgorot ?? 0;
  const lineTotalAgorot = Math.round(unitPriceAgorot * rm);

  const fabricCostPerM = variant?.costPerMeterAgorot ?? 0;
  const liningCostPerM = liningVariant?.costPerMeterAgorot ?? settings.liningCostPerMeterAgorot;

  const costLines: PriceBreakdownLine[] = [
    {
      label: product?.name ?? 'القماش',
      detail: `${(fabricCostPerM / 100).toFixed(0)} × ${win.fullness}`,
      amountAgorot: Math.round(fabricCostPerM * win.fullness),
    },
  ];
  if (win.hasLining) {
    costLines.push({
      label: 'البطانة',
      detail: `${(liningCostPerM / 100).toFixed(0)} × ${win.fullness}`,
      amountAgorot: Math.round(liningCostPerM * win.fullness),
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

  const costPerRunningMeter = costLines.reduce((sum, l) => sum + l.amountAgorot, 0);
  const internalCostAgorot = Math.round(costPerRunningMeter * rm);
  const marginAgorot = lineTotalAgorot - internalCostAgorot;
  const marginPercent = lineTotalAgorot > 0 ? (marginAgorot / lineTotalAgorot) * 100 : 0;

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
  const discountAgorot = Math.round((subtotalAgorot * discountPercent) / 100);
  const net = subtotalAgorot - discountAgorot;
  const vatAgorot = Math.round((net * settings.vatPercent) / 100);
  const totalAgorot = net + vatAgorot;
  const marginAgorot = net - internalCostAgorot;
  const marginPercent = net > 0 ? Math.round((marginAgorot / net) * 10000) / 100 : 0;
  return {
    subtotalAgorot,
    discountAgorot,
    vatAgorot,
    totalAgorot,
    internalCostAgorot,
    marginAgorot,
    marginPercent,
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
