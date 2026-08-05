/**
 * خطة القماش والتخصيص التلقائي.
 *
 * دوال خالصة على قاعدة البيانات - لا React ولا حالة. أُخرجت من `hooks/selectors`
 * لأن المخزن نفسه صار يحتاجها للحجز التلقائي، ولو استوردها من هناك لأصبح
 * الاستيراد دائريًا (selectors تستورد المخزن).
 */
import type { Database } from '@/data/seed';
import { rollBalance } from '@/domain/inventory';
import { round3 } from '@/domain/pricing';
import type { UUID } from '@/types/domain';

export type FabricNeed = { variantId: string; meters: number; label: string };

/** ما يحتاجه المشروع من كل صنف، محسوبًا من قياسات الشبابيك ومضاعفاتها. */
export function projectFabricPlan(db: Database, projectId: UUID): FabricNeed[] {
  const windows = db.windows.filter((w) => w.projectId === projectId);
  const map = new Map<string, FabricNeed>();
  for (const w of windows) {
    const fabric = round3((w.widthCm / 100) * w.quantity * w.fullness);
    if (w.fabricVariantId) {
      const v = db.fabricVariants.find((x) => x.id === w.fabricVariantId);
      const p = db.fabricProducts.find((x) => x.id === v?.productId);
      const key = w.fabricVariantId;
      const prev = map.get(key);
      map.set(key, {
        variantId: key,
        meters: round3((prev?.meters ?? 0) + fabric),
        label: `${p?.name ?? ''} ${v?.colorName ?? ''}`.trim(),
      });
    }
    if (w.hasLining && w.liningVariantId) {
      const v = db.fabricVariants.find((x) => x.id === w.liningVariantId);
      const p = db.fabricProducts.find((x) => x.id === v?.productId);
      const key = w.liningVariantId;
      const prev = map.get(key);
      map.set(key, {
        variantId: key,
        meters: round3((prev?.meters ?? 0) + fabric),
        label: `${p?.name ?? ''} ${v?.colorName ?? ''}`.trim(),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * ما يحتاجه شباك واحد من قماشه (دون البطانة).
 *
 * البطانة صنف مستقلّ في الخطة، والخياط يؤكّد استهلاك قماش الستارة عند
 * إنهائها؛ فصلهما هنا يمنع أن تُحسب أمتار البطانة على رصيد القماش.
 */
export function windowFabricNeed(db: Database, windowId: UUID): number {
  const w = db.windows.find((x) => x.id === windowId);
  if (!w) return 0;
  return round3((w.widthCm / 100) * w.quantity * w.fullness);
}

/** الشبابيك التي سُجِّل لها استهلاك - أي أنهاها الخياط فعلًا. */
export function finishedWindowIds(db: Database, projectId: UUID): Set<UUID> {
  return new Set(
    db.usages
      .filter((u) => u.projectId === projectId && u.windowId)
      .map((u) => u.windowId as UUID),
  );
}

export type FabricGap = {
  variantId: string;
  label: string;
  /** المطلوب كله. */
  required: number;
  /** المحجوز فعلًا لهذا المشروع. */
  reserved: number;
  /** المتبقي المطلوب حجزه. */
  remaining: number;
  /** المتاح في كل رولات هذا الصنف. */
  available: number;
};

/** المطلوب مقابل المحجوز مقابل المتاح - أساس الحجز التلقائي ورسائل النقص. */
export function projectFabricGaps(db: Database, projectId: UUID): FabricGap[] {
  const active = db.reservations.filter((r) => r.projectId === projectId && r.status !== 'released');
  return projectFabricPlan(db, projectId).map((need) => {
    const reserved = round3(
      active
        .filter((r) => db.fabricRolls.find((x) => x.id === r.rollId)?.variantId === need.variantId)
        .reduce((s, r) => s + r.quantityM, 0),
    );
    const available = round3(
      db.fabricRolls
        .filter((r) => r.variantId === need.variantId)
        .reduce((s, r) => s + rollBalance(r.id, db.stockMovements).availableM, 0),
    );
    return {
      variantId: need.variantId,
      label: need.label,
      required: need.meters,
      reserved,
      remaining: round3(Math.max(0, need.meters - reserved)),
      available,
    };
  });
}

export type RollPick = { rollId: UUID; meters: number };

/**
 * اختيار الرولات لتغطية كمية مطلوبة من صنف واحد.
 *
 * الأفضلية المطلقة لرولٍ واحد يكفي وحده: خلط دفعتَي صبغ في ستارة واحدة عيبٌ
 * يُرى بالعين على الجدار ولا يُصلَح بعد القص. ومن بين الرولات الكافية يُختار
 * أضيقها هامشًا حتى تبقى الرولات الكبيرة سليمة لمشاريع أكبر.
 *
 * وإن لم يكفِ رولٌ وحده وُزّعت الكمية على الأكبر فالأكبر - أقل عدد دفعات ممكن.
 * وإن لم يكفِ المخزون كله رجعت القائمة فارغة: الحجز الجزئي أسوأ من لا شيء،
 * لأنه يقضم المتاح دون أن يُطلق الإنتاج ويُخفي حجم النقص الحقيقي.
 */
export function pickRolls(
  db: Database,
  variantId: string,
  needed: number,
): RollPick[] {
  if (!(needed > 0)) return [];
  const candidates = db.fabricRolls
    .filter((r) => r.variantId === variantId)
    .map((r) => ({ id: r.id, available: rollBalance(r.id, db.stockMovements).availableM }))
    .filter((r) => r.available > 0);

  const singles = candidates
    .filter((r) => r.available >= needed)
    .sort((a, b) => a.available - b.available);
  if (singles.length > 0) return [{ rollId: singles[0].id, meters: round3(needed) }];

  const total = candidates.reduce((s, r) => s + r.available, 0);
  if (total < needed) return [];

  const picks: RollPick[] = [];
  let left = needed;
  for (const r of [...candidates].sort((a, b) => b.available - a.available)) {
    if (left <= 0) break;
    const take = round3(Math.min(r.available, left));
    picks.push({ rollId: r.id, meters: take });
    left = round3(left - take);
  }
  return picks;
}
