/**
 * اسم ملفّ PDF الذي يصل الزبون. بلا `<title>` يحفظه المتصفّح باسم
 * `localhost` - وهو ما يراه الزبون في واتساب.
 */
import { expect, test } from 'bun:test';

import { withTitle } from '@/domain/htmlDoc';

const DOC = '<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="utf-8" />\n</head><body>x</body></html>';

test('يحقن العنوان بعد <head> مباشرةً', () => {
  const out = withTitle(DOC, 'Q-2026-0001 - محمد أحمد');
  expect(out).toContain('<head><title>Q-2026-0001 - محمد أحمد</title>');
  // الوثيقة تبقى سليمةً وكاملة
  expect(out).toContain('<!DOCTYPE html>');
  expect(out).toContain('<body>x</body>');
});

test('يحترم <head> ذا السمات', () => {
  const out = withTitle('<html><head data-x="1"></head></html>', 'تقرير 8.2026');
  expect(out).toContain('<head data-x="1"><title>تقرير 8.2026</title>');
});

test('لا يكرّر عنوانًا موجودًا', () => {
  const has = '<html><head><title>أصلي</title></head></html>';
  expect(withTitle(has, 'جديد')).toBe(has);
});

test('يُنقّي ما يكسر الترميز - ولا يحقن وسمًا من اسم الزبون', () => {
  const out = withTitle(DOC, 'زبون <script>alert(1)</script> & شركاه');
  expect(out).not.toContain('<script>');
  expect(out).toContain('<title>زبون script alert(1) /script شركاه</title>');
});

test('عنوانٌ فارغ أو مسافاتٌ فقط: تُترك الوثيقة كما هي', () => {
  expect(withTitle(DOC, '   ')).toBe(DOC);
  expect(withTitle(DOC, '')).toBe(DOC);
});

test('وثيقةٌ بلا <head> تُترك كما هي بدل أن تُشوَّه', () => {
  const noHead = '<html><body>x</body></html>';
  expect(withTitle(noHead, 'عنوان')).toBe(noHead);
});
