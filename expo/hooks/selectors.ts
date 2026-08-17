import { useMemo } from 'react';

import type { Database } from '@/data/seed';
import { rollBalance, type RollBalance } from '@/domain/inventory';
import { round3 } from '@/domain/pricing';
import { useStore } from '@/providers/store';
import type {
  Customer,
  FabricProduct,
  FabricRoll,
  FabricVariant,
  Project,
  QuotationVersion,
  UUID,
} from '@/types/domain';

export function useDb(): Database {
  return useStore().db;
}

export function useCustomer(id: UUID | undefined): Customer | null {
  const db = useDb();
  return useMemo(() => db.customers.find((c) => c.id === id) ?? null, [db.customers, id]);
}

export function useProject(id: UUID | undefined): Project | null {
  const db = useDb();
  return useMemo(() => db.projects.find((p) => p.id === id) ?? null, [db.projects, id]);
}

export interface RollView {
  roll: FabricRoll;
  variant: FabricVariant | null;
  product: FabricProduct | null;
  balance: RollBalance;
}

export function useRollViews(): RollView[] {
  const db = useDb();
  return useMemo(
    () =>
      db.fabricRolls.map((roll) => {
        const variant = db.fabricVariants.find((v) => v.id === roll.variantId) ?? null;
        const product = db.fabricProducts.find((p) => p.id === variant?.productId) ?? null;
        return { roll, variant, product, balance: rollBalance(roll.id, db.stockMovements) };
      }),
    [db.fabricRolls, db.fabricVariants, db.fabricProducts, db.stockMovements],
  );
}

export function useRollView(rollId: UUID | undefined): RollView | null {
  const views = useRollViews();
  return useMemo(() => views.find((v) => v.roll.id === rollId) ?? null, [views, rollId]);
}

export interface VariantStockView {
  variantId: UUID;
  variant: FabricVariant | null;
  product: FabricProduct | null;
  availableM: number;
  reservedM: number;
  consumedM: number;
  /** الاستلامات (الرولات داخليًا) بترتيب الأحدث أولًا. */
  receipts: RollView[];
  /** كم مترًا منها أمانةً عند خياطين - للسطر الهادئ تحت الرقم البطل. */
  consignedM: number;
}

/**
 * المخزون بالأمتار لكل صنفٍ لا بالرولات (قرار المالك 8.8.2026): «لن يتم
 * تدوين عدد الرولات.. إنما عدد الأمتار فقط من كل نوع».
 *
 * الرول باقٍ تحت السطح - عليه تقوم دفعات الصبغ والحجز كل رولٍ على حدة -
 * لكنه صار «استلامًا» يُسرد تفصيلًا تحت صنفه، لا وحدةَ العرض الأولى.
 * الترتيب بالمتاح تنازليًا: ما يُدار يتصدّر، والفارغ يهبط آخر القائمة.
 */
export function useVariantStockViews(
  /** يقصر التجميع على رولاتٍ بعينها - كحصّة خياطٍ واحد في «بضاعتي». */
  filter?: (r: RollView) => boolean,
): VariantStockView[] {
  const rolls = useRollViews();
  return useMemo(() => {
    const map = new Map<UUID, VariantStockView>();
    for (const r of filter ? rolls.filter(filter) : rolls) {
      const key = r.roll.variantId;
      let g = map.get(key);
      if (!g) {
        g = {
          variantId: key,
          variant: r.variant,
          product: r.product,
          availableM: 0,
          reservedM: 0,
          consumedM: 0,
          receipts: [],
          consignedM: 0,
        };
        map.set(key, g);
      }
      g.availableM = round3(g.availableM + r.balance.availableM);
      g.reservedM = round3(g.reservedM + r.balance.reservedM);
      g.consumedM = round3(g.consumedM + r.balance.consumedM);
      if (r.roll.assignedTailorId) {
        g.consignedM = round3(g.consignedM + r.balance.availableM + r.balance.reservedM);
      }
      g.receipts.push(r);
    }
    for (const g of map.values()) {
      g.receipts.sort((a, b) => b.roll.createdAt.localeCompare(a.roll.createdAt));
    }
    // القماش أولًا ثم البطانة زمرةً واحدة (قرار المالك): هما صنفان لكن
    // البطانة تُقرأ معًا، والفاصل بين الزمرتين ترسمه الشاشة
    return Array.from(map.values()).sort((a, b) => {
      const aLining = a.product?.kind === 'lining' ? 1 : 0;
      const bLining = b.product?.kind === 'lining' ? 1 : 0;
      if (aLining !== bLining) return aLining - bLining;
      return b.availableM - a.availableM;
    });
  }, [rolls, filter]);
}

export function currentVersion(db: Database, projectId: UUID): QuotationVersion | null {
  const quotation = db.quotations.find((q) => q.projectId === projectId);
  if (!quotation) return null;
  return db.quotationVersions.find((v) => v.id === quotation.currentVersionId) ?? null;
}

export function approvedVersion(db: Database, projectId: UUID): QuotationVersion | null {
  const quotation = db.quotations.find((q) => q.projectId === projectId);
  if (!quotation) return null;
  const versions = db.quotationVersions
    .filter((v) => v.quotationId === quotation.id && v.status === 'approved')
    .sort((a, b) => b.versionNumber - a.versionNumber);
  return versions[0] ?? null;
}

export interface ProjectFinance {
  totalAgorot: number;
  paidAgorot: number;
  dueAgorot: number;
  paidRatio: number;
}

export function projectFinance(db: Database, projectId: UUID): ProjectFinance {
  const version = approvedVersion(db, projectId) ?? currentVersion(db, projectId);
  const totalAgorot = version?.totalAgorot ?? 0;
  const paidAgorot = db.payments
    .filter((p) => p.projectId === projectId)
    .reduce((s, p) => s + p.amountAgorot, 0);
  const dueAgorot = Math.max(0, totalAgorot - paidAgorot);
  return {
    totalAgorot,
    paidAgorot,
    dueAgorot,
    paidRatio: totalAgorot > 0 ? Math.min(1, paidAgorot / totalAgorot) : 0,
  };
}

// الخطة صارت في `domain/fabricPlan` لأن المخزن يحتاجها للحجز التلقائي؛ تُعاد
// هنا لتبقى نقطة الاستيراد واحدة لمن كان يستوردها من قبل.
export { projectFabricGaps, projectFabricPlan } from '@/domain/fabricPlan';

export function unreadCount(db: Database, userId: UUID | null | undefined): number {
  if (!userId) return 0;
  return db.notifications.filter((n) => n.userId === userId && !n.readAt).length;
}

// عائلة المشروع صارت في `domain/annex` لأنها منطقٌ صافٍ يحتاجه المتجر
// والاختبارات معًا؛ تُعاد هنا لتبقى نقطة الاستيراد واحدة لمن كان يستوردها.
export {
  projectAnnexes,
  projectFamilyFinance,
  rootProjectId,
  type ProjectFamilyFinance,
} from '@/domain/annex';
