/**
 * أرقام عائلة المشروع: الأصل والملحق والإجمالي.
 *
 * هذه أرقامٌ يُطالَب بها زبون، فخطؤها ليس خطأ عرض. تُختبر مرآةً لعرض
 * `api.project_family_finance` على الخادم - الرقمان يجب أن يتفقا.
 */
import { expect, test } from 'bun:test';

import type { Database } from '@/data/seed';
import {
  projectAnnexes,
  projectBalance,
  projectFamilyFinance,
  projectOwnApprovedAgorot,
  rootProjectId,
  rootProjects,
} from '@/domain/annex';

function makeDb(over: Partial<Database>): Database {
  return {
    projects: [],
    quotations: [],
    quotationVersions: [],
    payments: [],
    ...over,
  } as unknown as Database;
}

/** أصل بعرضٍ معتمد 8,400 ₪ + ملحق بعرضٍ بحالةٍ تُمرَّر. */
const family = (annexStatus: string | null, annexTotal = 190000) =>
  makeDb({
    projects: [
      { id: 'root', code: 'BD-1', title: 'بيت', status: 'with_tailor' },
      ...(annexStatus
        ? [{ id: 'anx', code: 'BD-1/1', title: 'بيت - ملحق 1', status: 'measured',
             parentProjectId: 'root', annexSeq: 1 }]
        : []),
    ] as never,
    quotations: [
      { id: 'q1', projectId: 'root' },
      ...(annexStatus ? [{ id: 'q2', projectId: 'anx' }] : []),
    ] as never,
    quotationVersions: [
      { id: 'v1', quotationId: 'q1', status: 'approved', totalAgorot: 840000 },
      ...(annexStatus
        ? [{ id: 'v2', quotationId: 'q2', status: annexStatus, totalAgorot: annexTotal }]
        : []),
    ] as never,
    payments: [{ id: 'p1', projectId: 'root', amountAgorot: 500000 }] as never,
  });

test('الأرقام الثلاثة: أصل وملحق وإجماليهما', () => {
  const f = projectFamilyFinance(family('approved'), 'root');
  expect(f.originalAgorot).toBe(840000);
  expect(f.annexAgorot).toBe(190000);
  expect(f.totalAgorot).toBe(1030000);
  expect(f.annexCount).toBe(1);
});

test('ما لم يوقّعه الزبون ليس دَينًا: الملحق المسوَّد يساهم بصفر', () => {
  for (const st of ['draft', 'sent', 'rejected']) {
    const f = projectFamilyFinance(family(st), 'root');
    expect(f.annexAgorot).toBe(0);
    expect(f.totalAgorot).toBe(840000);
    // ومع ذلك يُعدّ ملحقًا قائمًا: الورشة تراه وإن لم يُسعَّر بعد
    expect(f.annexCount).toBe(1);
  }
});

test('الرصيد واحد: الدفعات على الجذر تُخصم من الإجمالي لا من الأصل وحده', () => {
  const f = projectFamilyFinance(family('approved'), 'root');
  expect(f.paidAgorot).toBe(500000);
  expect(f.dueAgorot).toBe(530000);
});

test('قراءة الأرقام من داخل الملحق تعطي أرقام العائلة نفسها', () => {
  const db = family('approved');
  const fromAnnex = projectFamilyFinance(db, 'anx');
  const fromRoot = projectFamilyFinance(db, 'root');
  expect(fromAnnex).toEqual(fromRoot);
  expect(fromAnnex.rootId).toBe('root');
});

test('الجذر والملاحق يُستخرجان من أي طرف', () => {
  const db = family('approved');
  expect(rootProjectId(db, 'anx')).toBe('root');
  expect(rootProjectId(db, 'root')).toBe('root');
  expect(projectAnnexes(db, 'anx').map((a) => a.id)).toEqual(['anx']);
  expect(projectAnnexes(db, 'root').map((a) => a.id)).toEqual(['anx']);
});

test('مشروع بلا ملاحق: الإجمالي هو الأصل ولا ملحق يُعدّ', () => {
  const f = projectFamilyFinance(family(null), 'root');
  expect(f.originalAgorot).toBe(840000);
  expect(f.annexAgorot).toBe(0);
  expect(f.totalAgorot).toBe(840000);
  expect(f.annexCount).toBe(0);
  expect(f.dueAgorot).toBe(340000);
});

/* ── ما اصطاده التدقيق: الرصيد كان يُقرأ على المستند لا على العائلة ────────
   أصلٌ 8,400 ₪ وملحقٌ معتمد 1,900 ₪، وقد سدّد الزبون 10,300 ₪ كاملةً على
   الأصل - لأن الدفع على الملحق ممنوع في القاعدة. الخطأ القديم: شاشة الأصل
   تقرأ إجماليها وحده (8,400) فتُظهر «سُدّد بالكامل» بل وتُضمر فائضًا، وصفُّ
   الملحق يبقى في تبويب الديون بـ1,900 لا يمحوها دفعٌ أبدًا. */

const settled = () => {
  const db = family('approved');
  db.payments = [
    { id: 'p1', projectId: 'root', amountAgorot: 500000 },
    { id: 'p2', projectId: 'root', amountAgorot: 530000 },
  ] as never;
  return db;
};

test('العائلة المسدَّدة: لا دَين على الأصل ولا على الملحق', () => {
  const db = settled();
  const onRoot = projectBalance(db, 'root');
  expect(onRoot.totalAgorot).toBe(1030000);
  expect(onRoot.paidAgorot).toBe(1030000);
  expect(onRoot.dueAgorot).toBe(0);
  expect(onRoot.paidRatio).toBe(1);
  // الرصيد واحد من أي طرفٍ قُرئ - لا رقمان متناقضان على شاشة
  expect(projectBalance(db, 'anx')).toEqual(onRoot);
});

test('الملحق المعتمد غير المسدَّد يرفع دَين الأصل ولا يصير صفًّا ثانيًا', () => {
  const db = family('approved'); // دُفع 5,000 من 10,300
  expect(projectBalance(db, 'root').dueAgorot).toBe(530000);
  expect(rootProjects(db).map((p) => p.id)).toEqual(['root']);
});

test('مسوَّدة الملحق ليست دَينًا، ومسوَّدة الأصل توقّعٌ يُعرض', () => {
  const draftAnnex = projectBalance(family('draft'), 'root');
  expect(draftAnnex.totalAgorot).toBe(840000);
  expect(draftAnnex.dueAgorot).toBe(340000);

  const db = family(null);
  db.quotationVersions = [
    { id: 'v1', quotationId: 'q1', status: 'draft', totalAgorot: 700000 },
  ] as never;
  db.quotations = [{ id: 'q1', projectId: 'root', currentVersionId: 'v1' }] as never;
  expect(projectBalance(db, 'root').totalAgorot).toBe(700000);
});

test('قيمة الملحق وحده تُقرأ لصفّه في القائمة', () => {
  const db = family('approved');
  expect(projectOwnApprovedAgorot(db, 'anx')).toBe(190000);
  expect(projectOwnApprovedAgorot(db, 'root')).toBe(840000);
  expect(projectOwnApprovedAgorot(family('draft'), 'anx')).toBe(0);
});
