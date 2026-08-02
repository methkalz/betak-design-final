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

export function projectFabricPlan(db: Database, projectId: UUID) {
  const windows = db.windows.filter((w) => w.projectId === projectId);
  const map = new Map<string, { variantId: string; meters: number; label: string }>();
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

export function unreadCount(db: Database, userId: UUID | null | undefined): number {
  if (!userId) return 0;
  return db.notifications.filter((n) => n.userId === userId && !n.readAt).length;
}
