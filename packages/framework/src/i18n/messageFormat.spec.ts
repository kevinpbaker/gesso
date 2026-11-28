import { describe, expect, it } from 'vitest';

import { compileMessage, MessageFormatError, type MessageValues } from './messageFormat';

const format = (source: string, values: MessageValues = {}, locale = 'en'): string =>
  compileMessage(source).format(values, locale);

/** `Intl` writes some spaces as U+202F or U+00A0; a spec compares words, not those. */
const spaces = (text: string): string => text.replace(/[  ]/gu, ' ');

describe('compileMessage', () => {
  it('fills arguments and leaves text alone', () => {
    expect(format('Hello, {name}!', { name: 'Ada' })).toBe('Hello, Ada!');
    expect(format('{a}{b}', { a: 1, b: 'x' })).toBe('1x');
    expect(format('No arguments')).toBe('No arguments');
  });

  it('chooses an English plural, an exact case before a category, and # as the number', () => {
    const items = '{count, plural, =0 {Your cart is empty} one {# item} other {# items}}';
    expect(format(items, { count: 0 })).toBe('Your cart is empty');
    expect(format(items, { count: 1 })).toBe('1 item');
    expect(format(items, { count: 1234 })).toBe('1,234 items');
  });

  it('follows each language’s own plural rules', () => {
    const fr = '{n, plural, one {# fichier} other {# fichiers}}';
    // French counts 0 and 1 as one.
    expect(format(fr, { n: 0 }, 'fr')).toBe('0 fichier');
    expect(format(fr, { n: 2 }, 'fr')).toBe('2 fichiers');

    const ar = '{n, plural, zero {zero} one {one} two {two} few {few} many {many} other {other}}';
    expect([0, 1, 2, 3, 11, 100].map(n => format(ar, { n }, 'ar'))).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other'
    ]);

    const ru = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}';
    expect([1, 3, 5, 21].map(n => format(ru, { n }, 'ru'))).toEqual(['1 файл', '3 файла', '5 файлов', '21 файл']);
  });

  it('chooses an ordinal', () => {
    const place = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
    expect([1, 2, 3, 4, 11, 22].map(n => format(place, { n }))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '22nd']);
  });

  it('selects, with other as the fallback, and # still the number inside a nested select', () => {
    const role = '{role, select, admin {Administrator} other {Member}}';
    expect(format(role, { role: 'admin' })).toBe('Administrator');
    expect(format(role, { role: 'guest' })).toBe('Member');

    const nested = '{n, plural, one {{who, select, me {I have # task} other {{who} has # task}}} other {# tasks}}';
    expect(format(nested, { n: 1, who: 'me' })).toBe('I have 1 task');
    expect(format(nested, { n: 1, who: 'Ben' })).toBe('Ben has 1 task');
  });

  it('writes numbers the way the locale does', () => {
    expect(format('{n, number}', { n: 1234.5 }, 'en-CA')).toBe('1,234.5');
    expect(spaces(format('{n, number}', { n: 1234.5 }, 'fr-CA'))).toBe('1 234,5');
    expect(format('{n, number, integer}', { n: 2.7 })).toBe('3');
    expect(format('{n, number, percent}', { n: 0.25 })).toBe('25%');
    expect(format('{n, number, ::currency/CAD}', { n: 12.5 }, 'en-CA')).toBe('$12.50');
    expect(spaces(format('{n, number, ::currency/CAD}', { n: 12.5 }, 'fr-CA'))).toBe('12,50 $');
    expect(format('{n, number, ::compact-short}', { n: 15300 })).toBe('15K');
    expect(format('{n, number, ::.00}', { n: 3 })).toBe('3.00');
    expect(format('{n, number, ::group-off}', { n: 12345 })).toBe('12345');
  });

  it('writes a calendar day as that day, wherever the person is', () => {
    expect(format('{d, date, medium}', { d: '2026-11-27' }, 'en-CA')).toBe('Nov 27, 2026');
    expect(format('{d, date, long}', { d: '2026-11-27' }, 'fr-CA')).toBe('27 novembre 2026');
    expect(format('{d, date, short}', { d: '2026-01-05' }, 'en-CA')).toBe('2026-01-05');
  });

  it('escapes with apostrophes as ICU does', () => {
    expect(format("Don't stop")).toBe("Don't stop");
    expect(format("It''s")).toBe("It's");
    expect(format("'{literal}' braces")).toBe('{literal} braces');
    expect(format("{n, plural, other {'#' is # here}}", { n: 4 })).toBe('# is 4 here');
    expect(format('# outside a plural')).toBe('# outside a plural');
  });

  it('names the arguments a message reads', () => {
    expect(compileMessage('{a} {n, plural, one {{b}} other {#}}').names).toEqual(['a', 'n', 'b']);
  });

  it('shows a missing argument as itself and reports it', () => {
    const problems: string[] = [];
    expect(compileMessage('Hello, {name}').format({}, 'en', problem => problems.push(problem))).toBe('Hello, {name}');
    expect(problems).toEqual(['no value for "name"']);
  });

  it('refuses what it does not support, naming the place', () => {
    const refused = (source: string): string => {
      try {
        compileMessage(source);
      } catch (error) {
        expect(error).toBeInstanceOf(MessageFormatError);
        return (error as Error).message;
      }
      return 'compiled';
    };
    expect(refused('{n, spellout}')).toContain('Unsupported argument type "spellout"');
    expect(refused('{n, plural, one {x}}')).toContain('needs an "other" case');
    expect(refused('{n, plural, offset:1 other {x}}')).toContain('"offset:" is not supported');
    expect(refused('{n, plural, lots {x} other {y}}')).toContain('"lots" is not a plural category');
    expect(refused('{n, number, ::scientific}')).toContain('Unsupported number skeleton "scientific"');
    expect(refused('{d, date, tiny}')).toContain('Unsupported date style "tiny"');
    expect(refused('Hello {name')).toContain('Unclosed argument');
    expect(refused('stray } brace')).toContain('Unmatched "}"');
  });
});
