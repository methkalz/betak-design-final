/**
 * تدفّق الغرفة والشباك - خطواتٌ يقيسها الميدان بالثواني.
 *
 * لا يمكن تشغيل مكوّن RN تحت bun:test، فتُفحص العقود التي يقوم عليها
 * التدفّق: قائمة الاقتراحات المشتركة، وترتيب الحفظ الذي يمنع غرفةً يتيمة،
 * وموضع لافتة النجاح.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOM_SUGGESTIONS } from './labels';
import { translateTerm } from './quoteGlossary';

const HERE = import.meta.dir;
const editor = readFileSync(join(HERE, '..', 'components', 'WindowEditor.tsx'), 'utf8');
const project = readFileSync(join(HERE, '..', 'app', 'project', '[id].tsx'), 'utf8');

test('قائمة الاقتراحات مشتركةٌ لا منسوخة', () => {
  expect(ROOM_SUGGESTIONS.length).toBeGreaterThan(4);
  // الشاشتان تستوردانها ولا تُعرّفها أيٌّ منهما
  expect(editor).toContain("ROOM_SUGGESTIONS");
  expect(editor).not.toContain('const ROOM_SUGGESTIONS');
  expect(project).not.toContain('const ROOM_SUGGESTIONS');
});

/**
 * ★ الاقتراحات تُطبع في وثيقة الزبون، والوثيقة العبرية تترجمها. فاسمٌ
 * يُقترح ولا يعرفه المعجم يخرج عربيًّا وسط نصٍّ عبريّ.
 */
test('★ كلّ اسمٍ مقترَح يعرفه المعجم العبريّ', () => {
  for (const room of ROOM_SUGGESTIONS) {
    const he = translateTerm(room, 'he');
    expect(he).not.toBe(room); // تُرجم فعلًا
    expect(he).not.toMatch(/[\u0600-\u06FF]/); // ولا حرفَ عربيٍّ بقي
  }
});

test('★ الحفظ يسبق إنشاء الغرفة - فلا غرفةَ يتيمة في مشروعٍ مقفل', () => {
  const i = editor.indexOf('const submitAndNewRoom');
  const body = editor.slice(i, i + 900);
  const save = body.indexOf('await save()');
  const room = body.indexOf('addRoom(');
  expect(save).toBeGreaterThan(-1);
  expect(room).toBeGreaterThan(-1);
  expect(save).toBeLessThan(room);
});

test('★ لافتة النجاح في رأس الصفحة - التمرير يذهب إليها لا يهرب منها', () => {
  const banner = editor.indexOf('savedFlash && <Banner');
  const buttons = editor.indexOf('label="حفظ + شباك في نفس الغرفة"');
  expect(banner).toBeGreaterThan(-1);
  expect(banner).toBeLessThan(buttons);
});

test('الانتقال بـreplace لا push - رزمة الرجوع لا تتضخّم بغرفة', () => {
  const i = editor.indexOf('const submitAndNewRoom');
  const body = editor.slice(i, i + 1200);
  expect(body).toContain('router.replace');
  expect(body).not.toContain('router.push');
});
