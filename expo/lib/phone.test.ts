import { describe, expect, it } from 'bun:test';

import { displayPhone, normalizePhone, phoneIdentityEmail } from './phone';

describe('تطبيع رقم الهاتف', () => {
  it('يقبل الصيغ التي يكتبها الناس فعلًا ويصل بها إلى رقم واحد', () => {
    const same = '972526444414';
    for (const written of [
      '0526444414',
      '052-644-4414',
      '052 644 4414',
      '526444414',
      '972526444414',
      '+972526444414',
      '+972-52-644-4414',
      '00972526444414',
      ' 0526444414 ',
    ]) {
      expect(normalizePhone(written)).toBe(same);
    }
  });

  it('أرقام المالك الخمسة كلها صالحة ومتمايزة', () => {
    const owners = [
      '0526444414',
      '0544614364',
      '0549068709',
      '0532743339',
      '0509270077',
    ].map((p) => normalizePhone(p));
    expect(owners.every((p) => p !== null)).toBe(true);
    expect(new Set(owners).size).toBe(5);
  });

  it('يرفض ما ليس جوّالًا إسرائيليًا', () => {
    for (const bad of [
      '',
      '   ',
      'abc',
      '052644441', // ناقص خانة
      '05264444141', // زائد خانة
      '0426444414', // لا يبدأ بـ5 بعد الصفر
      '0026444414',
      '+1526444414',
    ]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });

  it('العرض يعيد الصيغة المحلية المألوفة', () => {
    expect(displayPhone('972526444414')).toBe('052-644-4414');
    expect(displayPhone('0509270077')).toBe('050-927-0077');
  });

  it('العرض يترك ما لا يُطبَّع كما هو بلا تشويه', () => {
    expect(displayPhone('غير معروف')).toBe('غير معروف');
  });

  it('بريد الهوية مشتق من الرقم المطبَّع لا من صيغة الكتابة', () => {
    expect(phoneIdentityEmail('052-644-4414')).toBe('972526444414@baytak.local');
    expect(phoneIdentityEmail('+972 52 644 4414')).toBe('972526444414@baytak.local');
    expect(phoneIdentityEmail('لا رقم')).toBeNull();
  });
});
