/**
 * توقيت الإسناد - متى يصير كل دور ضروريًا.
 * الخطأ هنا يُنتج لوحةً تصرخ بما لا فعل له، أو تصمت عمّا يوقف العمل.
 */
import { test, expect } from 'bun:test';

import { assignmentGaps, needsInstaller, needsMeasurer, projectsAssignedTo } from './assignment';
import type { Database } from '@/data/seed';
import type { Project } from '@/types/domain';

const P = (over: Partial<Project>): Project =>
  ({
    id: 'p',
    status: 'new_request',
    measurementWorkerId: null,
    installerId: null,
    tailorId: null,
    ...over,
  }) as Project;

test('القائس ينقص فقط قبل إتمام القياس', () => {
  expect(needsMeasurer(P({ status: 'new_request' }))).toBe(true);
  expect(needsMeasurer(P({ status: 'awaiting_measurement' }))).toBe(true);
  // بعد القياس لا معنى للمطالبة بقائس - العمل تجاوزه
  expect(needsMeasurer(P({ status: 'measured' }))).toBe(false);
  expect(needsMeasurer(P({ status: 'new_request', measurementWorkerId: 'f1' }))).toBe(false);
});

test('المركّب لا يصير ضروريًا قبل جاهزية الورشة', () => {
  // مشروع في التسعير لا يُلام على غياب مركّب - التركيب بعيد
  expect(needsInstaller(P({ status: 'quotation' }))).toBe(false);
  expect(needsInstaller(P({ status: 'with_tailor' }))).toBe(false);
  expect(needsInstaller(P({ status: 'ready_for_install' }))).toBe(true);
  expect(needsInstaller(P({ status: 'ready_for_install', installerId: 'f2' }))).toBe(false);
});

test('اللوحة تُبلّغ عن النقص المُعطِّل وحده، والمكتمل خارج الحساب', () => {
  const db = {
    projects: [
      P({ id: 'a', status: 'new_request' }), // ينقصه قائس
      P({ id: 'b', status: 'ready_for_install', measurementWorkerId: 'f1' }), // ينقصه مركّب
      P({ id: 'c', status: 'quotation', measurementWorkerId: 'f1' }), // لا نقص الآن
      P({ id: 'd', status: 'completed' }), // مُغلق - لا يُطالَب بشيء
    ],
  } as unknown as Database;
  const gaps = assignmentGaps(db);
  expect(gaps.length).toBe(2);
  expect(gaps.find((g) => g.projectId === 'a')?.kind).toBe('measurement');
  expect(gaps.find((g) => g.projectId === 'b')?.kind).toBe('installation');
});

test('«مشاريع مسندة» تجمع الأدوار الثلاثة ولا تكرّر المشروع', () => {
  const db = {
    projects: [
      P({ id: 'a', measurementWorkerId: 'x' }),
      P({ id: 'b', installerId: 'x' }),
      P({ id: 'c', tailorId: 'x' }),
      // نفس الشخص قاس وركّب: مشروع واحد لا اثنان
      P({ id: 'd', measurementWorkerId: 'x', installerId: 'x' }),
      P({ id: 'e', tailorId: 'y' }),
    ],
  } as unknown as Database;
  expect(projectsAssignedTo(db, 'x').map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
});
