/**
 * روابط المتجر داخل التطبيق: شرط Google Play (الخصوصية) وApple (حذف الحساب).
 */
import { expect, test } from 'bun:test';

import { LEGAL_LINKS } from './legalLinks';

test('الصفحات التي تشترطها المتاجر حاضرة، وكلّها https على betakd.com', () => {
  const keys = LEGAL_LINKS.map((l) => l.key);
  expect(keys).toContain('privacy');
  expect(keys).toContain('delete-account');
  for (const l of LEGAL_LINKS) {
    expect(l.url).toMatch(/^https:\/\/betakd\.com\/[a-z-]+\/$/);
    expect(l.label.length).toBeGreaterThan(0);
  }
});
