import { compileMessage, type MessageValues } from './messageFormat';

/** A catalog: message ids and their ICU messages, in one language. */
export type Catalog = Readonly<Record<string, string>>;

/**
 * The same ids as a source catalog, in another language.
 *
 *   export const fr = { 'cart.items': '…' } satisfies Translations<typeof en>;
 *
 * Every id is required, so a message added to the source and not yet
 * translated is a type error in each language that lacks it. A
 * language that is translated a piece at a time says so with
 * `Partial<Translations<typeof en>>`, and the missing ids fall back.
 */
export type Translations<Source extends Catalog> = { readonly [K in keyof Source]: string };

/** A catalog, or a function that loads one, for a language that is not on screen at start. */
export type CatalogSource = Catalog | (() => Promise<Catalog>);

/**
 * A message the data layer names rather than words: plain data, so it
 * can cross the barrier, and the view says it in the person's language.
 *
 *   view: { problem: { id: 'save.failed', values: { name: 'Q3 budget' } } }
 */
export interface MessageRef {
  readonly id: string;
  readonly values?: MessageValues;
}

/**
 * The source catalog, as written: the ids are what every other language
 * must translate, and the strings are what shows when one has not.
 *
 *   export const en = defineMessages({
 *     'cart.items': '{count, plural, =0 {Your cart is empty} one {# item} other {# items}}'
 *   });
 *
 * Each message is compiled here once, so a mistake in the source
 * catalog fails where it is written rather than when a screen first
 * shows it.
 */
export function defineMessages<const M extends Record<string, string>>(messages: M): M {
  for (const source of Object.values(messages)) {
    compileMessage(source);
  }
  return messages;
}

/**
 * Formats one message from a catalog, once: for the application
 * worker, which names messages rather than words, but sometimes has to
 * word one that leaves the app (an export, a notification). The view
 * formats with `I18n`, which follows the language as it changes.
 */
export function formatMessage(catalog: Catalog, id: string, values: MessageValues, locale: string): string {
  const source = catalog[id];
  return source === undefined ? id : compileMessage(source).format(values, locale);
}
