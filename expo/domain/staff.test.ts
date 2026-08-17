/**
 * مؤشرات ملف الموظف.
 *
 * هذه أرقامٌ يُحكم بها على أشخاص، فخطؤها ليس خطأ عرض. تُشغَّل مع `bun test`.
 */
import { test, expect } from 'bun:test';

import { staffDossier, staffPulse } from './staff';
import type { Database } from '@/data/seed';

// 15 آذار 2026 الساعة العاشرة - كل التواريخ أدناه تُقاس منه
const NOW = new Date('2026-03-15T10:00:00.000Z').getTime();

function makeDb(over: Partial<Database>): Database {
  return {
    profiles: [],
    projects: [],
    tailorAssignments: [],
    fieldVisits: [],
    usages: [],
    auditLogs: [],
    quotationVersions: [],
    payments: [],
    ...over,
  } as unknown as Database;
}

const metric = (d: ReturnType<typeof staffDossier>, label: string) =>
  d.metrics.find((m) => m.label === label);

test('الخياط: المتأخر يُحسب متأخرًا والتسليم في يوم الموعد ليس تأخيرًا', () => {
  const db = makeDb({
    profiles: [{ id: 't1', role: 'tailor' }] as never,
    projects: [{ id: 'p1', title: 'بيت أ', tailorId: 't1' }] as never,
    tailorAssignments: [
      // مفتوح وفات موعده
      { id: 'a1', projectId: 'p1', tailorId: 't1', dueDate: '2026-03-10T00:00:00.000Z', completedAt: null, startedAt: null, instructions: '' },
      // مفتوح وموعده لم يحن
      { id: 'a2', projectId: 'p1', tailorId: 't1', dueDate: '2026-03-20T00:00:00.000Z', completedAt: null, startedAt: null, instructions: '' },
      // سُلّم مساء يوم الموعد - في الوقت لا متأخرًا
      { id: 'a3', projectId: 'p1', tailorId: 't1', dueDate: '2026-03-05T00:00:00.000Z', completedAt: '2026-03-05T21:00:00.000Z', startedAt: '2026-03-03T09:00:00.000Z', instructions: '' },
      // سُلّم بعد الموعد بيوم
      { id: 'a4', projectId: 'p1', tailorId: 't1', dueDate: '2026-03-01T00:00:00.000Z', completedAt: '2026-03-02T09:00:00.000Z', startedAt: '2026-02-28T09:00:00.000Z', instructions: '' },
    ] as never,
  });

  const d = staffDossier(db, 't1', NOW);
  expect(d.open.length).toBe(2);
  expect(metric(d, 'متأخرة عن التسليم')?.value).toBe('1');
  expect(metric(d, 'أنجز هذا الشهر')?.value).toBe('2');
  expect(metric(d, 'التزام بالموعد')?.value).toBe('50%');
  expect(metric(d, 'متأخرة عن التسليم')?.alarming).toBe(true);
});

test('الخياط: الهدر يُنسب عبر مشاريعه ويُنبَّه فوق 8٪', () => {
  const db = makeDb({
    profiles: [{ id: 't1', role: 'tailor' }] as never,
    projects: [
      { id: 'p1', title: 'بيت أ', tailorId: 't1' },
      { id: 'p2', title: 'بيت ب', tailorId: 'other' },
    ] as never,
    usages: [
      { id: 'u1', projectId: 'p1', actualM: 100, wasteM: 12 },
      // مشروع خياط آخر - لا يُحتسب عليه
      { id: 'u2', projectId: 'p2', actualM: 100, wasteM: 0 },
    ] as never,
  });

  const d = staffDossier(db, 't1', NOW);
  expect(metric(d, 'نسبة الهدر')?.value).toBe('12.0%');
  expect(metric(d, 'نسبة الهدر')?.alarming).toBe(true);
});

test('العامل الميداني: الزيارات المنجزة والموقّعة تُحسب من التركيبات وحدها', () => {
  const db = makeDb({
    profiles: [{ id: 'f1', role: 'field' }] as never,
    // قاس وركّب المشروع نفسه: يُعدّ مشروعًا واحدًا لا اثنين
    projects: [
      { id: 'p1', title: 'بيت أ', measurementWorkerId: 'f1', installerId: 'f1' },
    ] as never,
    fieldVisits: [
      { id: 'v1', projectId: 'p1', assigneeId: 'f1', type: 'measurement', status: 'scheduled', scheduledAt: '2026-03-12T00:00:00.000Z', completedAt: null, customerSignedOff: false },
      { id: 'v2', projectId: 'p1', assigneeId: 'f1', type: 'installation', status: 'completed', scheduledAt: '2026-03-02T00:00:00.000Z', completedAt: '2026-03-02T00:00:00.000Z', customerSignedOff: true },
      { id: 'v3', projectId: 'p1', assigneeId: 'f1', type: 'installation', status: 'completed', scheduledAt: '2026-03-04T00:00:00.000Z', completedAt: '2026-03-04T00:00:00.000Z', customerSignedOff: false },
      // قياس منجز: يدخل «أنجز هذا الشهر» ولا يدخل نسبة التوقيع
      { id: 'v4', projectId: 'p1', assigneeId: 'f1', type: 'measurement', status: 'completed', scheduledAt: '2026-03-06T00:00:00.000Z', completedAt: '2026-03-06T00:00:00.000Z', customerSignedOff: false },
    ] as never,
  });

  const d = staffDossier(db, 'f1', NOW);
  expect(metric(d, 'فات موعدها')?.value).toBe('1');
  expect(metric(d, 'أنجز هذا الشهر')?.value).toBe('3');
  expect(metric(d, 'تركيبات موقّعة')?.value).toBe('50%');
  expect(metric(d, 'مشاريع مسندة')?.value).toBe('1');
});

test('لا نسبة بلا مقام: القسمة على صفر تُعرض شرطة لا 0٪', () => {
  const db = makeDb({ profiles: [{ id: 't1', role: 'tailor' }] as never });
  const d = staffDossier(db, 't1', NOW);
  expect(metric(d, 'التزام بالموعد')?.value).toBe('-');
  expect(metric(d, 'نسبة الهدر')?.value).toBe('-');
  expect(metric(d, 'متوسط مدة الأمر')?.value).toBe('-');
});

test('المبيعات تُقاس بالعروض لا بمواعيد لا تملكها', () => {
  const db = makeDb({
    profiles: [{ id: 's1', role: 'sales' }] as never,
    quotationVersions: [
      { id: 'q1', createdBy: 's1', status: 'approved', createdAt: '2026-03-04T00:00:00.000Z' },
      { id: 'q2', createdBy: 's1', status: 'sent', createdAt: '2026-03-08T00:00:00.000Z' },
      // الشهر الماضي: يدخل نسبة الاعتماد لا عدّاد الشهر
      { id: 'q3', createdBy: 's1', status: 'rejected', createdAt: '2026-02-20T00:00:00.000Z' },
      { id: 'q4', createdBy: 'other', status: 'approved', createdAt: '2026-03-01T00:00:00.000Z' },
    ] as never,
  });

  const d = staffDossier(db, 's1', NOW);
  expect(metric(d, 'عروض هذا الشهر')?.value).toBe('2');
  expect(metric(d, 'نسبة الاعتماد')?.value).toBe('33%');
  expect(metric(d, 'التزام بالموعد')).toBeUndefined();
});

/* ═══════ نبض الطاقم: الترتيب هو الميزة، فهو ما يُختبر ═══════ */

const pulseDb = () =>
  makeDb({
    profiles: [
      { id: 'a1', role: 'admin', fullName: 'الأدمن', isActive: true },
      { id: 'f1', role: 'field', fullName: 'ميداني متأخر', isActive: true },
      { id: 'f2', role: 'field', fullName: 'ميداني مشغول', isActive: true },
      { id: 't1', role: 'tailor', fullName: 'خياط ساكن', isActive: true },
      { id: 'x1', role: 'field', fullName: 'معطَّل', isActive: false },
    ] as never,
    projects: [{ id: 'p1', title: 'بيت أ' }] as never,
    fieldVisits: [
      // f1: واحدة فات موعدها
      { id: 'v1', projectId: 'p1', assigneeId: 'f1', type: 'measurement', status: 'scheduled', scheduledAt: '2026-03-10T09:00:00.000Z', completedAt: null, customerSignedOff: false },
      // f2: ثلاث قادمة، لا متأخر فيها
      { id: 'v2', projectId: 'p1', assigneeId: 'f2', type: 'measurement', status: 'scheduled', scheduledAt: '2026-03-18T09:00:00.000Z', completedAt: null, customerSignedOff: false },
      { id: 'v3', projectId: 'p1', assigneeId: 'f2', type: 'installation', status: 'scheduled', scheduledAt: '2026-03-19T09:00:00.000Z', completedAt: null, customerSignedOff: false },
      { id: 'v4', projectId: 'p1', assigneeId: 'f2', type: 'installation', status: 'scheduled', scheduledAt: '2026-03-20T09:00:00.000Z', completedAt: null, customerSignedOff: false },
    ] as never,
    auditLogs: [
      { id: 'l1', actorId: 'f2', createdAt: '2026-03-15T08:00:00.000Z' },
      { id: 'l2', actorId: 't1', createdAt: '2026-03-05T08:00:00.000Z' },
    ] as never,
  });

test('نبض الطاقم: المتأخر أولًا ثم الأثقل حملًا ثم الأطول سكونًا', () => {
  const rows = staffPulse(pulseDb(), NOW, 'a1');
  expect(rows.map((r) => r.profileId)).toEqual(['f1', 'f2', 't1']);
  expect(rows[0].overdue).toBe(1);
  expect(rows[1].open).toBe(3);
  expect(rows[1].overdue).toBe(0);
});

test('نبض الطاقم: المعطَّل والأدمن والقارئ نفسه خارج القائمة', () => {
  const ids = staffPulse(pulseDb(), NOW, 'a1').map((r) => r.profileId);
  expect(ids).not.toContain('x1'); // معطَّل
  expect(ids).not.toContain('a1'); // القارئ (وهو أدمن)
  // ولو قرأها غير الأدمن، يبقى الأدمن خارجها ويخرج القارئ نفسه
  expect(staffPulse(pulseDb(), NOW, 'f2').map((r) => r.profileId)).toEqual(['f1', 't1']);
});

test('نبض الطاقم: السكون يُقاس بالأيام، ومن لا أثر له يُميَّز عمن عمل اليوم', () => {
  const rows = staffPulse(pulseDb(), NOW, 'a1');
  const busy = rows.find((r) => r.profileId === 'f2')!;
  const quiet = rows.find((r) => r.profileId === 't1')!;
  const never = rows.find((r) => r.profileId === 'f1')!;
  expect(busy.idleDays).toBe(0);
  expect(quiet.idleDays).toBe(10);
  expect(never.idleDays).toBeNull();
  expect(never.lastActiveAt).toBeNull();
});

test('نبض الطاقم: أقرب موعد قادم يُلتقط لمن ليس متأخرًا', () => {
  const busy = staffPulse(pulseDb(), NOW, 'a1').find((r) => r.profileId === 'f2')!;
  expect(busy.nextDueAt).toBe('2026-03-18T09:00:00.000Z');
});
