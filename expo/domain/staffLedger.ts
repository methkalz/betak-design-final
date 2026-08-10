/**
 * دفاتر الطاقم - مستحقات الخياط وأجرة الميداني وجدولة الشيكات.
 *
 * دوال خالصة قابلة للاختبار. المبدأ المحاسبي الحاكم هنا:
 *
 * **الاستحقاق يُشتق ولا يُخزَّن.** مستحق الخياط عن الورشة محسوب من أجرته
 * لكل متر في قواعد التسعير × أمتار الشبابيك، ومستحق الميداني من عدد زياراته
 * المكتملة × أجرة الزيارة. لو خُزّن الاستحقاق صفًّا لكان دفترين يفترقان:
 * تصحيح قاعدة تسعير أو زيارة لا يصحّح الصف المنسوخ. ما يُخزَّن هو الدفعات
 * وحدها - فهي وقائع لا مشتقات.
 *
 * والرصيد جارٍ لا شهري (M14): مجموع المستحق منذ البداية ناقص مجموع المدفوع
 * منذ البداية. الدفع المقدَّم (M15) لا يحتاج معاملة خاصة - يسبق الاستحقاق
 * فيهبط الرصيد تحت الصفر، وهذا هو «بالسالب لصالح المحل» بلا حالة إضافية.
 */
import type { Database } from '@/data/seed';
import { findRule, floorToShekel, resolveBand, resolveCategory, round3 } from '@/domain/pricing';
import type { Role, UUID } from '@/types/domain';

/** مستحق الخياط عن شباك واحد: أجرته للمتر (حسب الشريحة والفئة) × أمتاره. */
export function windowTailorFeeAgorot(db: Database, windowId: UUID): number {
  const w = db.windows.find((x) => x.id === windowId);
  if (!w || w.heightCm > 500) return 0; // فوق 500: تسعير خاص بلا قاعدة
  const product = db.fabricProducts.find(
    (p) => p.id === db.fabricVariants.find((v) => v.id === w.fabricVariantId)?.productId,
  );
  const kind: 'crepe' | 'other' = product?.kind === 'crepe' ? 'crepe' : 'other';
  const rule = findRule(db.pricingRules, resolveBand(w.heightCm), resolveCategory(kind, w.hasLining));
  if (!rule) return 0;
  const rm = round3((w.widthCm / 100) * w.quantity);
  return floorToShekel(Math.round(rm * rule.tailorCostPerMeterAgorot));
}

export type TailorAccrual = {
  assignmentId: UUID;
  projectId: UUID;
  completedAt: string;
  feeAgorot: number;
  metersM: number;
};

/** ورشات الخياط المُنهاة («جاهز») ومستحقّه عن كلٍّ منها. */
export function tailorAccruals(db: Database, tailorId: UUID): TailorAccrual[] {
  return db.tailorAssignments
    .filter((a) => a.tailorId === tailorId && a.stage === 'ready' && !!a.completedAt)
    .map((a) => {
      const windows = db.windows.filter((w) => w.projectId === a.projectId);
      return {
        assignmentId: a.id,
        projectId: a.projectId,
        completedAt: a.completedAt as string,
        feeAgorot: windows.reduce((s, w) => s + windowTailorFeeAgorot(db, w.id), 0),
        metersM: round3(windows.reduce((s, w) => s + (w.widthCm / 100) * w.quantity, 0)),
      };
    })
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

export type FieldAccrual = { visitId: UUID; projectId: UUID; completedAt: string; wageAgorot: number };

/** زيارات الميداني المكتملة وأجرة كلٍّ منها (من الإعدادات). */
export function fieldAccruals(db: Database, workerId: UUID): FieldAccrual[] {
  const wage = db.settings.fieldVisitWageAgorot;
  return db.fieldVisits
    .filter((v) => v.assigneeId === workerId && v.status === 'completed' && !!v.completedAt)
    .map((v) => ({
      visitId: v.id,
      projectId: v.projectId,
      completedAt: v.completedAt as string,
      wageAgorot: wage,
    }))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

export type StaffBalance = {
  accruedAgorot: number;
  paidAgorot: number;
  /** موجب = للمعرض أن يدفعه؛ سالب = سلفة عند الموظف لصالح المعرض. */
  balanceAgorot: number;
  itemsCount: number;
};

/** الرصيد الجاري: مستحقٌ منذ البداية − مدفوعٌ منذ البداية. لا يعرف الشهر. */
export function staffBalance(db: Database, staffId: UUID, role: Role): StaffBalance {
  const accrued =
    role === 'tailor'
      ? tailorAccruals(db, staffId).reduce((s, a) => s + a.feeAgorot, 0)
      : role === 'field'
        ? fieldAccruals(db, staffId).reduce((s, a) => s + a.wageAgorot, 0)
        : 0;
  const items =
    role === 'tailor'
      ? tailorAccruals(db, staffId).length
      : role === 'field'
        ? fieldAccruals(db, staffId).length
        : 0;
  const paid = db.staffLedger
    .filter((e) => e.staffId === staffId)
    .reduce((s, e) => s + e.amountAgorot, 0);
  return {
    accruedAgorot: accrued,
    paidAgorot: paid,
    balanceAgorot: accrued - paid,
    itemsCount: items,
  };
}

/**
 * جدول شيكات شهري من أول استحقاق (M6).
 *
 * القاعدة المستقرة في جدولة الأقساط: يوم الاستحقاق يثبت على يوم الشيك
 * الأول، والشهر الأقصر يُقصّ إلى آخر يومٍ فيه ولا يفيض إلى الشهر التالي -
 * شيك 31.1 يليه 28.2 ثم يعود 31.3، ولا يتحوّل قط إلى 2.3.
 */
export function checkSchedule(firstDueISO: string, count: number): string[] {
  const first = new Date(firstDueISO);
  const anchorDay = first.getDate();
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(first);
    d.setDate(1); // أولًا إلى يومٍ آمن كي لا يفيض تغيير الشهر
    d.setMonth(first.getMonth() + i);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(anchorDay, daysInMonth));
    out.push(d.toISOString());
  }
  return out;
}
