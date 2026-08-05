/**
 * مؤشرات ملف الموظف.
 *
 * هذه أرقامٌ يُحكم بها على أشخاص، فخطؤها ليس خطأ عرض. تُشغَّل مع `bun test`.
 */
import { test, expect } from 'bun:test';

import { staffDossier } from './staff';
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
