/**
 * حراسة نموذج التنقّل - المخاطرة المحدَّدة في الخطة (R5): رفعُ شروط الأدوار
 * إلى مصدرٍ واحد قد يسرّب وجهةً لدورٍ لا يملكها، والشريط الجانبي يعرضها
 * فيرى الخيّاط زرَّ المخزون. هنا تُقفل الشروط على ما كانت عليه حرفيًّا في
 * `(tabs)/_layout.tsx` قبل الرفع.
 */
import { expect, test } from 'bun:test';

import { activeDestination, TAB_ORDER, TAB_OWNS, tabDestinations } from '@/domain/navigation';
import type { Role } from '@/types/domain';

const ROLES: Role[] = ['admin', 'sales', 'field', 'tailor'];

/** الوجهات المتوقّعة لكلّ دور - منقولةٌ من شروط الشريط السفليّ الأصلية. */
const EXPECTED: Record<Role, string[]> = {
  admin: ['/home', '/projects', '/customers', '/inventory', '/more'],
  sales: ['/home', '/projects', '/customers', '/inventory', '/more'],
  field: ['/home', '/projects', '/visits', '/more'],
  tailor: ['/home', '/tasks', '/mystock', '/more'],
};

test('كلّ دورٍ يرى وجهاته هو - لا أكثر ولا أقلّ', () => {
  for (const role of ROLES) {
    const visible = TAB_ORDER.map((t) => tabDestinations(role)[t]).filter(Boolean);
    expect(visible.sort()).toEqual([...EXPECTED[role]].sort());
  }
});

test('الخيّاط لا يرى المخزون ولا الزبائن ولا المشاريع', () => {
  const d = tabDestinations('tailor');
  expect(d.inventory).toBeNull();
  expect(d.customers).toBeNull();
  expect(d.projects).toBeNull();
  expect(d.visits).toBeNull();
});

test('الميدانيّ لا يرى المخزون ولا الزبائن، والإداريّ لا يرى بضاعتي', () => {
  const f = tabDestinations('field');
  expect(f.inventory).toBeNull();
  expect(f.customers).toBeNull();
  expect(f.mystock).toBeNull();
  for (const role of ['admin', 'sales'] as Role[]) {
    const a = tabDestinations(role);
    expect(a.mystock).toBeNull();
    expect(a.tasks).toBeNull();
    expect(a.visits).toBeNull();
  }
});

test('الرئيسية والمزيد لكلّ دور - لا بابَ مغلقًا على أحد', () => {
  for (const role of ROLES) {
    expect(tabDestinations(role).home).toBe('/home');
    expect(tabDestinations(role).more).toBe('/more');
  }
});

/**
 * الشريط يجب أن يقول «أين أنت» وأنت ثلاث شاشاتٍ عميقًا. هذه الحالات هي
 * الرحلات الواقعية: مشروعٌ ← مقترح سعر ← شباك، ومخزونٌ ← قماش ← لفّة.
 */
test('المسار العميق يُضيء التبويب الذي يملكه', () => {
  const cases: [string, string][] = [
    ['/home', '/home'],
    ['/projects', '/projects'],
    ['/project/abc-123', '/projects'],
    ['/quotation/q-1', '/projects'],
    ['/window/w-9', '/projects'],
    ['/reserve/p-1', '/projects'],
    ['/customer/c-4', '/customers'],
    ['/fabric/f-2', '/inventory'],
    ['/roll/r-7', '/inventory'],
    ['/stock/v-3', '/inventory'],
    ['/consumption', '/inventory'],
    ['/visit/v-1', '/visits'],
    ['/tailor/t-8', '/tasks'],
    ['/settings', '/more'],
    ['/team/new', '/more'],
    ['/pricing-rules', '/more'],
    ['/audit', '/more'],
  ];
  for (const [path, want] of cases) {
    expect(activeDestination(path)).toBe(want);
  }
});

test('مسارٌ مجهول لا يُضيء شيئًا بدل أن يُضيء الخطأ', () => {
  expect(activeDestination('/login')).toBeNull();
  expect(activeDestination('/')).toBeNull();
  expect(activeDestination('/nonsense')).toBeNull();
});

test('كلّ وجهةٍ في TAB_OWNS تملك نفسها - فلا وجهةَ بلا إضاءة', () => {
  for (const dest of Object.keys(TAB_OWNS)) {
    expect(activeDestination(dest)).toBe(dest);
  }
});

test('«/project» لا يلتقط «/projects» - التطابق على الحدود لا على النصّ', () => {
  // بادئةٌ نصّية ساذجة كانت ستجعل /projects تطابق /project أيضًا
  expect(activeDestination('/projects')).toBe('/projects');
  expect(activeDestination('/project/x')).toBe('/projects');
});
