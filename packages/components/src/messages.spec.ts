import { describe, expect, it } from 'vitest';

import { createComponent, createI18n, defineMessages, provideI18n, type Translations } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, Text, UiEnvironmentKeys, type UiChild, type UiNode } from 'gesso-core';

import { menuFor } from './ContextMenus';
import { componentMessages, type ComponentMessages } from './messages';
import { Pagination } from './Pagination';
import { Alert } from './Alert';

const app = defineMessages({ title: 'Orders' });

const fr: Partial<Translations<ComponentMessages>> = {
  'gesso.dismiss': 'Ignorer',
  'gesso.pagination.label': 'Pagination',
  'gesso.pagination.previous': 'Page précédente',
  'gesso.pagination.next': 'Page suivante',
  'gesso.pagination.page': 'Page {page, number}',
  'gesso.contextMenu.copy': 'Copier'
};

const mount = (child: UiChild, i18n?: ReturnType<typeof createI18n>) =>
  renderTest(
    Column(
      { width: 640, height: 160, padding: 8, provide: i18n === undefined ? undefined : [provideI18n(i18n)] },
      child
    ),
    { width: 640, height: 160 }
  );

describe('the built-in components’ words', () => {
  it('are English with no I18n provided', () => {
    const ui = mount(createComponent(Pagination, { page: 2, pageCount: 5 }));
    expect(ui.getByRole('button', { name: 'Previous page' })).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Page 3' })).toBeTruthy();
  });

  it('are translated by the components catalog of the I18n they are placed under', () => {
    const i18n = createI18n({ source: app, components: { fr }, locale: 'fr', onMissing: () => {} });
    const ui = mount(createComponent(Pagination, { page: 2, pageCount: 5 }), i18n);

    expect(ui.getByRole('button', { name: 'Page précédente' })).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Page suivante' })).toBeTruthy();
  });

  it('change where they stand when the language does, with nothing remounted', async () => {
    const i18n = createI18n({
      source: app,
      locales: { fr: {} },
      components: { fr },
      locale: 'en',
      onMissing: () => {}
    });
    const ui = mount(
      createComponent(Alert, { title: 'Saved', message: 'Your order is in.', onDismiss: () => {} }),
      i18n
    );
    const button = ui.getByRole('button', { name: 'Dismiss' });

    await i18n.setLocale('fr');
    ui.frame();

    expect(ui.getByRole('button', { name: 'Ignorer' })).toBe(button);
  });

  it('give an input the application passes the last word', () => {
    const i18n = createI18n({ source: app, components: { fr }, locale: 'fr', onMissing: () => {} });
    const ui = mount(createComponent(Pagination, { page: 1, pageCount: 3, label: 'Résultats' }), i18n);
    expect(ui.getByRole('navigation', { name: 'Résultats' })).toBeTruthy();
  });

  it('name a menu’s rows in the language it is given, English by default', () => {
    expect(menuFor(null, null, 'some text').map(row => row.label)).toEqual(['Copy']);
    const french = (id: keyof ComponentMessages): string => fr[id] ?? componentMessages[id];
    expect(menuFor(null, null, 'some text', french).map(row => row.label)).toEqual(['Copier']);
  });

  it('are each valid ICU, under the gesso namespace', () => {
    for (const id of Object.keys(componentMessages)) {
      expect(id.startsWith('gesso.')).toBe(true);
    }
  });

  it('mirror the app when the root follows the language’s direction', async () => {
    const i18n = createI18n({ source: app, locales: { ar: {} }, locale: 'en', onMissing: () => {} });
    let label: UiNode | null = null;
    const ui = renderTest(
      Column(
        { width: 200, height: 40, provide: [provideI18n(i18n)], textDirection: i18n.direction },
        Text({ text: 'x', ref: (node: UiNode | null) => (label = node) })
      ),
      { width: 200, height: 40 }
    );
    expect(label!.environment?.get(UiEnvironmentKeys.textDirection)).toBe('ltr');

    await i18n.setLocale('ar');
    ui.frame();

    expect(label!.environment?.get(UiEnvironmentKeys.textDirection)).toBe('rtl');
  });
});
