/**
 * الضمانة المقفلة: **نسخة الهاتف لا تدخل الفرع المكتبيّ أبدًا** مهما كان
 * العرض المُبلَّغ. هذا الاختبار هو الحارس البنيويّ لقاعدة «لا تضرّ نسخة
 * التطبيق»: لو أزال أحدٌ لاحقًا شرط المنصّة من `resolveResponsive`، تسقط
 * البوابة هنا لا على جهاز زبون.
 */
import { expect, test } from 'bun:test';

import { breakpoint } from '@/constants/theme';
import { resolveResponsive } from '@/domain/responsive';

const NATIVE = ['ios', 'android'];
// عروضٌ خياليّة تفوق أيّ هاتف - ولو بلغها الجهاز يبقى القرار «مضغوطًا».
const WIDTHS = [320, 390, 430, 768, 1024, 1440, 3000];

test('الهاتف مضغوطٌ دائمًا - أيّ عرضٍ وأيّ منصّةٍ أصليّة', () => {
  for (const os of NATIVE) {
    for (const w of WIDTHS) {
      const r = resolveResponsive(w, os);
      expect(r.isDesktop).toBe(false);
      expect(r.isWide).toBe(false);
      expect(r.width).toBe(w);
    }
  }
});

test('الويب يقرّر بالعرض: العتبة 1024 شاملة وما دونها مضغوط', () => {
  expect(resolveResponsive(breakpoint.desktop - 1, 'web').isDesktop).toBe(false);
  expect(resolveResponsive(breakpoint.desktop, 'web').isDesktop).toBe(true);
  // متصفّح الهاتف ويبٌ أيضًا - وعرضه يبقيه مضغوطًا، وهذا مقصود
  expect(resolveResponsive(390, 'web').isDesktop).toBe(false);
});

test('العريض عتبةٌ أعلى ولا يُفعَّل قبل المكتبيّ', () => {
  expect(resolveResponsive(breakpoint.wide - 1, 'web').isWide).toBe(false);
  expect(resolveResponsive(breakpoint.wide, 'web').isWide).toBe(true);
  // كلّ عريضٍ مكتبيٌّ بالضرورة - العتبتان لا تتقاطعان
  for (const w of [1440, 1920, 2560]) {
    const r = resolveResponsive(w, 'web');
    expect(r.isWide && !r.isDesktop).toBe(false);
  }
});

test('سقوف التخطيط كلّها أوسع من أعرض هاتف - فلا أثرَ لها لو انطلقت', async () => {
  const { layout } = await import('@/constants/theme');
  const WIDEST_PHONE = 440; // ‏iPhone 16 Pro Max ≈ 440pt
  for (const cap of [layout.form, layout.text, layout.column, layout.columnWide]) {
    expect(cap).toBeGreaterThan(WIDEST_PHONE);
  }
});

/**
 * الحارس الحقيقي لقاعدة «لا تضرّ نسخة التطبيق»: قيم الهاتف مقفولةٌ على ما
 * كانت عليه **قبل** حزمة الويب. مصدر الأرقام هو الشيفرة التاريخية نفسها:
 * `ScrollScreen` كان `{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }`
 * وشاشات التبويب `{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }`
 * حيث lg=16 وmd=12. أيّ انحرافٍ هنا يسقط البوابة قبل أن يصل جهازًا.
 */
test('قيم الهاتف مطابقةٌ حرفيًّا لما كانت عليه قبل حزمة الويب', async () => {
  const { CONTENT_PHONE, LIST_PHONE } = await import('@/domain/responsive');
  const { spacing } = await import('@/constants/theme');

  expect(CONTENT_PHONE).toEqual({ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg });
  expect(LIST_PHONE).toEqual({ padding: spacing.lg, paddingBottom: 120, gap: spacing.md });

  // ولا سقفَ عرضٍ ولا توسيطٍ على الهاتف - المفاتيح غائبةٌ لا مضبوطةٌ بقيمة
  for (const style of [CONTENT_PHONE, LIST_PHONE]) {
    expect('maxWidth' in style).toBe(false);
    expect('alignSelf' in style).toBe(false);
    expect('width' in style).toBe(false);
  }
});

test('حاويات المكتب موسَّطةٌ ومحدودة العرض، وتسقط حشوة شريط التبويبات', async () => {
  const { CONTENT_DESKTOP, CONTENT_DESKTOP_WIDE, LIST_DESKTOP } = await import(
    '@/domain/responsive'
  );
  const { layout } = await import('@/constants/theme');

  for (const style of [CONTENT_DESKTOP, LIST_DESKTOP]) {
    expect(style.maxWidth).toBe(layout.column);
    expect(style.alignSelf).toBe('center');
    expect(style.width).toBe('100%');
    // الـ120 كانت لشريط تبويباتٍ سفليّ لا وجود له على المكتب
    expect(style.paddingBottom).toBe(layout.gutter);
    expect(style.paddingBottom).not.toBe(120);
  }
  expect(CONTENT_DESKTOP_WIDE.maxWidth).toBe(layout.columnWide);
  expect(CONTENT_DESKTOP_WIDE.maxWidth).toBeGreaterThan(CONTENT_DESKTOP.maxWidth);
});
