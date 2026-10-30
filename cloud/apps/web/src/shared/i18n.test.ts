import {describe, expect, it} from 'vitest';
import {catalogs, resolveLocale} from './i18n';

describe('locale boundary', () => {
  it('normalizes browser locales and refuses arbitrary stored values', () => {
    expect(resolveLocale('invalid', ['fr-FR', 'en-GB'])).toBe('en-US');
    expect(resolveLocale('zh-SG', ['en-US'])).toBe('zh-CN');
    expect(resolveLocale(undefined, ['fr-FR'])).toBe('zh-CN');
  });
  it('keeps both catalogs complete and nonempty', () => {
    expect(Object.keys(catalogs['en-US']).sort()).toEqual(Object.keys(catalogs['zh-CN']).sort());
    for (const catalog of Object.values(catalogs)) for (const value of Object.values(catalog)) expect(value.trim()).not.toBe('');
  });
});
