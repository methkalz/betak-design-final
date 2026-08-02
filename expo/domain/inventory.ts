/**
 * Inventory engine — the stock movement ledger is the single source of truth.
 * Balances are always derived from movements; they are never edited directly.
 */

import type { FabricReservation, MovementType, StockMovement, UUID } from '@/types/domain';
import { round3 } from './pricing';

// مرآة core.movement_effects في الخادم — المصدر المرجعي هناك، وأي تعديل يبدأ منه.
const ON_HAND_IN: MovementType[] = ['receipt', 'return', 'adjustment_in', 'transfer_in'];
const ON_HAND_OUT: MovementType[] = [
  'consumption',
  'overconsumption',
  'damage',
  'adjustment_out',
  'transfer_out',
];

export interface RollBalance {
  onHandM: number;
  reservedM: number;
  availableM: number;
  consumedM: number;
}

/**
 * Reservations hold stock without removing it: available = on hand − reserved.
 * Consumption reduces both on hand and the outstanding reservation.
 */
export function rollBalance(rollId: UUID, movements: StockMovement[]): RollBalance {
  let onHand = 0;
  let reserved = 0;
  let consumed = 0;
  for (const m of movements) {
    if (m.rollId !== rollId) continue;
    if (ON_HAND_IN.includes(m.type)) onHand += m.quantityM;
    if (ON_HAND_OUT.includes(m.type)) onHand -= m.quantityM;
    if (m.type === 'reservation') reserved += m.quantityM;
    if (m.type === 'reservation_release') reserved -= m.quantityM;
    if (m.type === 'consumption') {
      reserved -= m.quantityM;
      consumed += m.quantityM;
    }
  }
  reserved = Math.max(0, reserved);
  return {
    onHandM: round3(onHand),
    reservedM: round3(reserved),
    availableM: round3(Math.max(0, onHand - reserved)),
    consumedM: round3(consumed),
  };
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: 'استلام',
  reservation: 'حجز',
  reservation_release: 'فك حجز',
  consumption: 'استهلاك',
  overconsumption: 'استهلاك زائد',
  return: 'إرجاع',
  damage: 'تلف',
  adjustment_in: 'تسوية دخول',
  adjustment_out: 'تسوية خروج',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
};

export function movementDirection(type: MovementType): 'in' | 'out' | 'hold' {
  if (ON_HAND_IN.includes(type)) return 'in';
  if (ON_HAND_OUT.includes(type)) return 'out';
  return 'hold';
}

export interface ReserveCheck {
  ok: boolean;
  error?: string;
}

/** Guard mirrored from the `api.reserve_fabric` RPC — balance may never go negative. */
export function canReserve(quantityM: number, balance: RollBalance): ReserveCheck {
  if (!(quantityM > 0)) return { ok: false, error: 'الكمية يجب أن تكون أكبر من صفر.' };
  if (quantityM > balance.availableM) {
    return {
      ok: false,
      error: `الكمية المطلوبة (${quantityM} م) أكبر من المتاح (${balance.availableM} م).`,
    };
  }
  return { ok: true };
}

export function canConsume(quantityM: number, reservation: FabricReservation): ReserveCheck {
  if (!(quantityM > 0)) return { ok: false, error: 'الكمية يجب أن تكون أكبر من صفر.' };
  // مرآة private.reservation_remaining: الأصلي − المستهلك − المحرَّر − التالف
  const outstanding = round3(
    reservation.quantityM -
      reservation.consumedM -
      (reservation.releasedM ?? 0) -
      (reservation.damagedReservedM ?? 0),
  );
  if (quantityM > outstanding + 0.0001) {
    return {
      ok: false,
      error: `الاستهلاك (${quantityM} م) أكبر من المحجوز المتبقي (${outstanding} م). يلزم سبب وموافقة.`,
    };
  }
  return { ok: true };
}

export function dyeLotWarning(lots: string[]): string | null {
  const unique = Array.from(new Set(lots.filter(Boolean)));
  if (unique.length > 1) {
    return `تحذير: القص من دفعات صبغ مختلفة (${unique.join('، ')}) قد يسبب فرق لون.`;
  }
  return null;
}

export const LOW_STOCK_THRESHOLD_M = 20;
