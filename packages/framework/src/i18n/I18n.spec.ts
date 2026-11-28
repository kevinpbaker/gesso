import { describe, expect, it } from 'vitest';

import { internalState } from '../InternalState';
import { defineMessages, type Translations } from './catalog';
import { createI18n, fallbackChain } from './I18n';

const en = defineMessages({
  'cart.items': '{count, plural, =0 {Your cart is empty} one {# item} other {# items}}',
  'cart.total': 'Total: {total, number, ::currency/CAD}',
  greeting: 'Hello, {name}',
  'only.source': 'Only in English'
});

const fr: Partial<Translations<typeof en>> = {
  'cart.items': '{count, plural, =0 {Votre panier est vide} one {# article} other {# articles}}',
  'cart.total': 'Total : {total, number, ::currency/CAD}',
  greeting: 'Bonjour, {name}'
};

const frCA: Partial<Translations<typeof en>> = { greeting: 'Allô, {name}' };

const spaces = (text: string): string => text.replace(/[  ]/gu, ' ');

describe('createI18n', () => {
  it('picks the first of the person’s languages a catalog covers, keeping their region', () => {
    const i18n = createI18n({ source: en, locales: { fr }, languages: () => ['de-DE', 'fr-CA', 'en'] });
    expect(i18n.locale.value).toBe('fr-CA');
    expect(i18n.message('greeting', { name: 'Ada' }).value).toBe('Bonjour, Ada');
  });

  it('falls back to the source language when nothing matches', () => {
    const i18n = createI18n({ source: en, locales: { fr }, languages: () => ['ja'] });
    expect(i18n.locale.value).toBe('en');
  });

  it('looks up the most specific catalog first, then the language, then the source, and says so once', () => {
    const problems: string[] = [];
    const i18n = createI18n({
      source: en,
      locales: { fr, 'fr-CA': frCA },
      locale: 'fr-CA',
      onMissing: problem => problems.push(problem)
    });

    expect(i18n.message('greeting', { name: 'Ada' }).value).toBe('Allô, Ada');
    expect(i18n.message('cart.items', { count: 2 }).value).toBe('2 articles');
    expect(i18n.message('only.source').value).toBe('Only in English');
    void i18n.message('only.source').value;

    expect(problems).toEqual(['no "fr-CA" message for "only.source"; showing the source']);
  });

  it('re-formats a bound string when an argument cell changes', () => {
    const i18n = createI18n({ source: en, locale: 'en' });
    const count = internalState(1);
    const text = i18n.message('cart.items', { count });
    const seen: string[] = [];
    text.subscribe(value => seen.push(value));

    count.value = 3;
    count.value = 0;

    expect(seen).toEqual(['1 item', '3 items', 'Your cart is empty']);
  });

  it('switches language live: every bound string re-formats where it stands', async () => {
    const i18n = createI18n({ source: en, locales: { fr }, locale: 'en' });
    const items = i18n.message('cart.items', { count: 2 });
    const total = i18n.message('cart.total', { total: 1234.5 });
    const seen: string[] = [];
    items.subscribe(value => seen.push(value));

    await i18n.setLocale('fr');

    expect(seen).toEqual(['2 items', '2 articles']);
    // France writes the Canadian dollar as $CA; Canada writes it as $.
    expect(spaces(total.value)).toBe('Total : 1 234,50 $CA');
  });

  it('keeps the language on screen until a loading one has arrived', async () => {
    let arrive!: (catalog: typeof fr) => void;
    const i18n = createI18n({
      source: en,
      locales: { fr: () => new Promise(resolve => (arrive = resolve)) },
      locale: 'en'
    });
    const greeting = i18n.message('greeting', { name: 'Ada' });

    const switching = i18n.setLocale('fr');
    expect(i18n.loading.value).toBe('fr');
    expect(i18n.locale.value).toBe('en');
    expect(greeting.value).toBe('Hello, Ada');

    arrive(fr);
    await switching;

    expect(i18n.loading.value).toBeNull();
    expect(i18n.locale.value).toBe('fr');
    expect(greeting.value).toBe('Bonjour, Ada');
  });

  it('ignores a slow load that a later choice overtook', async () => {
    let arrive!: (catalog: typeof fr) => void;
    const i18n = createI18n({
      source: en,
      locales: { fr: () => new Promise(resolve => (arrive = resolve)) },
      locale: 'en'
    });
    const switching = i18n.setLocale('fr');
    await i18n.setLocale('en');
    arrive(fr);
    await switching;

    expect(i18n.locale.value).toBe('en');
  });

  it('leaves the language on screen when a catalog fails to load', async () => {
    const i18n = createI18n({
      source: en,
      locales: { fr: () => Promise.reject(new Error('offline')) },
      locale: 'en'
    });
    await expect(i18n.setLocale('fr')).rejects.toThrow('offline');
    expect(i18n.locale.value).toBe('en');
    expect(i18n.loading.value).toBeNull();
  });

  it('reads right to left for Arabic and Hebrew', async () => {
    const i18n = createI18n({ source: en, locales: { ar: {}, he: {} }, locale: 'en' });
    expect(i18n.direction.value).toBe('ltr');
    await i18n.setLocale('ar');
    expect(i18n.direction.value).toBe('rtl');
    await i18n.setLocale('he-IL');
    expect(i18n.direction.value).toBe('rtl');
  });

  it('formats a message the data layer named, and nothing for null', () => {
    const i18n = createI18n({ source: en, locale: 'en' });
    const problem = internalState<{ id: string; values?: { name: string } } | null>(null);
    const text = i18n.text(problem);

    expect(text.value).toBe('');
    problem.value = { id: 'greeting', values: { name: 'Ben' } };
    expect(text.value).toBe('Hello, Ben');
  });

  it('formats numbers, dates, lists and distances in the language on screen', async () => {
    const i18n = createI18n({ source: en, locales: { fr }, locale: 'en-CA' });
    const amount = i18n.number(1234.5, { style: 'currency', currency: 'CAD' });
    const day = i18n.date('2026-11-27', { dateStyle: 'long' });
    const names = i18n.list(['Ada', 'Ben', 'Cy']);
    const ago = i18n.relativeTime(-1, 'day');

    expect([amount.value, day.value, names.value, ago.value]).toEqual([
      '$1,234.50',
      'November 27, 2026',
      // Canadian English has no serial comma.
      'Ada, Ben and Cy',
      'yesterday'
    ]);

    await i18n.setLocale('fr-CA');
    expect([spaces(amount.value), day.value, names.value, ago.value]).toEqual([
      '1 234,50 $',
      '27 novembre 2026',
      'Ada, Ben et Cy',
      'hier'
    ]);
  });

  it('gives a library its own English as the last resort, translated where the app supplies it', async () => {
    const library = { 'lib.close': 'Close' };
    const i18n = createI18n({
      source: en,
      locales: { fr },
      components: { fr: () => Promise.resolve({ 'lib.close': 'Fermer' }) },
      locale: 'en',
      onMissing: () => {}
    });
    const close = i18n.lookup('lib.close', undefined, library);
    expect(close.value).toBe('Close');

    await i18n.setLocale('fr');
    expect(close.value).toBe('Fermer');
  });

  it('refuses a broken source catalog where it is written', () => {
    expect(() => defineMessages({ broken: '{n, plural, one {x}}' })).toThrow('needs an "other" case');
  });
});

describe('fallbackChain', () => {
  it('drops one subtag at a time', () => {
    expect(fallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh']);
    expect(fallbackChain('fr')).toEqual(['fr']);
  });
});
