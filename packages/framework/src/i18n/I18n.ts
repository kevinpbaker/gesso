import { createEnvironmentKey, provided, type UiEnvironmentKey, type UiProvision } from 'gesso-core';
import { isObservable, type Observable } from 'rxjs';

import { computed, type ComputedCell, type ReadSource } from '../computed';
import type { ReadableCell } from '../Input';
import { internalState, type InternalState } from '../InternalState';
import { type Catalog, type CatalogSource, type MessageRef } from './catalog';
import {
  compileMessage,
  formatDateValue,
  numberFormat,
  type CompiledMessage,
  type MessageValue,
  type MessageValues
} from './messageFormat';

/** A value a message is formatted with: as it is, or a cell or stream to follow. */
export type MessageInput = MessageValue | Observable<MessageValue>;

/** The arguments of a message, each as it is or as a cell to follow. */
export type MessageInputs = Readonly<Record<string, MessageInput>>;

export interface I18nOptions<Source extends Catalog> {
  /** The catalog every id is declared in, and the strings that show when a language lacks one. */
  readonly source: Source;
  /** The language `source` is written in. `en` by default. */
  readonly sourceLocale?: string;
  /** The other languages, by BCP 47 tag: a catalog, or a function that loads one. */
  readonly locales?: Readonly<Record<string, CatalogSource>>;
  /**
   * Translations of the built-in components' own strings (`Close`,
   * `Dismiss`, `Page 3 of 10`), by language. `gesso-components` exports
   * the English catalog, `componentMessages`, to translate from.
   */
  readonly components?: Readonly<Record<string, CatalogSource>>;
  /**
   * The language at start. By default, the first of the person's
   * languages (`navigator.languages`) that a catalog covers.
   */
  readonly locale?: string;
  /** Where the person's languages come from. `navigator.languages` by default. For specs. */
  readonly languages?: () => readonly string[];
  /** Hears each missing id or argument, once. `console.warn` by default. */
  readonly onMissing?: (problem: string) => void;
}

interface Active {
  /** The language on screen, as asked for: `fr-CA`. */
  readonly locale: string;
  /** The catalogs that cover it, most specific first: `fr-CA`, then `fr`. */
  readonly catalogs: readonly Catalog[];
}

/** Right-to-left scripts by language, for a platform with no `Intl.Locale` text info. */
const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'ha',
  'he',
  'iw',
  'khw',
  'ks',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi'
]);

/**
 * An application's strings, in the person's language, on the thread
 * that draws them.
 *
 *   const i18n = createI18n({
 *     source: en,
 *     locales: { fr, ar: () => import('./messages/ar').then(m => m.ar) }
 *   });
 *
 *   <column provide={[provideI18n(i18n)]} textDirection={i18n.direction}>
 *
 *   const t = i18nFrom(ctx);
 *   <text text={t.message('cart.items', { count: cart.view.count })} />
 *
 * Every string it hands out is a cell. Components run once, so a string
 * that has to change when the language does, or when a count does, is a
 * cell the text is bound to, and switching language re-formats each one
 * where it stands without remounting anything.
 */
export function createI18n<Source extends Catalog>(options: I18nOptions<Source>): I18n<Source> {
  return new I18n(options);
}

export class I18n<Source extends Catalog = Catalog> {
  /** The language on screen, as a BCP 47 tag. It changes once a new one's catalog has loaded. */
  readonly locale: ReadableCell<string>;
  /** Which way the language on screen reads; bind a root's `textDirection` to it. */
  readonly direction: ReadableCell<'ltr' | 'rtl'>;
  /** The language being loaded, or null when none is. */
  readonly loading: ReadableCell<string | null>;
  /** Every language a catalog is given for, the source's first. */
  readonly available: readonly string[];

  private readonly active: InternalState<Active>;
  private readonly loadingState = internalState<string | null>(null);
  private readonly sourceLocale: string;
  private readonly loaded = new Map<string, Catalog>();
  private readonly compiled = new WeakMap<Catalog, Map<string, CompiledMessage>>();
  private readonly reported = new Set<string>();
  private readonly onMissing: (problem: string) => void;
  private readonly languages: () => readonly string[];
  /** True until the application chooses a language: until then, the platform's choice is followed. */
  private following = true;
  private request = 0;

  constructor(private readonly options: I18nOptions<Source>) {
    this.sourceLocale = options.sourceLocale ?? 'en';
    this.available = [
      this.sourceLocale,
      ...Object.keys(options.locales ?? {}).filter(tag => tag !== this.sourceLocale)
    ];
    this.onMissing = options.onMissing ?? (problem => console.warn(`[gesso i18n] ${problem}`));
    this.languages =
      options.languages ??
      (() => {
        const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
        return nav?.languages ?? (nav?.language === undefined ? [] : [nav.language]);
      });

    const initial = options.locale ?? this.negotiate(this.languages());
    this.active = internalState<Active>({ locale: this.sourceLocale, catalogs: [] }, 'i18n');
    this.locale = computed(() => this.active.value.locale, { label: 'i18n.locale' });
    this.direction = computed(() => directionOf(this.active.value.locale), { label: 'i18n.direction' });
    this.loading = this.loadingState;

    if (options.locale !== undefined) {
      this.following = false;
    }
    // A language whose catalogs are all given as objects is on screen at
    // once; one that must load shows the source until it has.
    void this.setLocale(initial, { follow: this.following }).catch(() => {});

    const scope = globalThis as { addEventListener?: (type: string, listener: () => void) => void };
    if (options.languages === undefined && typeof scope.addEventListener === 'function') {
      scope.addEventListener('languagechange', () => {
        if (this.following) {
          void this.setLocale(this.negotiate(this.languages()), { follow: true }).catch(() => {});
        }
      });
    }
  }

  /**
   * Puts another language on screen. Its catalogs load first, and the
   * language on screen stays until they have, so nothing flashes in the
   * source language on the way. Answers once it is on screen; rejects,
   * leaving the old one, if a catalog fails to load.
   *
   * After this the application has chosen, and a change to the
   * platform's languages no longer moves it.
   */
  async setLocale(locale: string, options: { readonly follow?: boolean } = {}): Promise<void> {
    this.following = options.follow === true;
    const request = ++this.request;
    const tags = fallbackChain(locale);
    const pending = tags.flatMap(tag =>
      [this.options.locales?.[tag], this.options.components?.[tag]].filter(
        (entry): entry is () => Promise<Catalog> =>
          typeof entry === 'function' && !this.loaded.has(cacheKey(tag, entry))
      )
    );
    if (pending.length > 0) {
      this.loadingState.value = locale;
      try {
        await Promise.all(
          tags.flatMap(tag =>
            [this.options.locales?.[tag], this.options.components?.[tag]].map(async entry => {
              if (typeof entry === 'function' && !this.loaded.has(cacheKey(tag, entry))) {
                this.loaded.set(cacheKey(tag, entry), await entry());
              }
            })
          )
        );
      } finally {
        if (request === this.request) {
          this.loadingState.value = null;
        }
      }
    }
    if (request !== this.request) {
      return;
    }
    const catalogs: Catalog[] = [];
    for (const tag of tags) {
      for (const entry of [this.options.locales?.[tag], this.options.components?.[tag]]) {
        const catalog = typeof entry === 'function' ? this.loaded.get(cacheKey(tag, entry)) : entry;
        if (catalog !== undefined) {
          catalogs.push(catalog);
        }
      }
    }
    this.active.next({ locale, catalogs });
  }

  /**
   * A message from the application's catalog, in the language on
   * screen, as a cell. An argument given as a cell or a stream is
   * followed, so `{ count: cart.view.count }` re-formats as the count
   * changes.
   */
  message(id: keyof Source & string, values?: MessageInputs): ComputedCell<string> {
    return this.lookup(id, values, this.options.source);
  }

  /** A message the data layer named, `{ id, values }`, or a stream of them. */
  text(ref: MessageRef | Observable<MessageRef | null> | null): ComputedCell<string> {
    return computed(read => {
      const current = isObservable(ref) ? read(ref) : ref;
      return current === null || current === undefined
        ? ''
        : this.formatNow(current.id, current.values ?? {}, this.options.source, this.active.value);
    });
  }

  /** A message formatted once, in the language on screen now: for a string that leaves the screen. */
  format(id: keyof Source & string, values: MessageValues = {}): string {
    return this.formatNow(id, values, this.options.source, this.active.getValue());
  }

  /**
   * A message from a library's catalog: the same lookup as `message`,
   * with `defaults` (the library's own English) as the last resort
   * rather than the application's source. The built-in components read
   * their strings this way.
   */
  lookup(id: string, values: MessageInputs | undefined, defaults: Catalog): ComputedCell<string> {
    return computed(read => this.formatNow(id, readAll(values, read), defaults, this.active.value), {
      label: `i18n.${id}`
    });
  }

  /** A number in the language on screen: `1 234,5` in French, `1,234.5` in English. */
  number(value: MessageInput, options: Intl.NumberFormatOptions = {}): ComputedCell<string> {
    return computed(read => {
      const current = readOne(value, read);
      return current === null || current === undefined || current === ''
        ? ''
        : numberFormat(this.active.value.locale, options).format(Number(current));
    });
  }

  /**
   * A date or a time. A calendar day given as `YYYY-MM-DD` is shown as
   * that day wherever the person is.
   */
  date(value: MessageInput, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): ComputedCell<string> {
    return computed(read => {
      const current = readOne(value, read);
      return current === null || current === undefined
        ? ''
        : formatDateValue(current, this.active.value.locale, options);
    });
  }

  /** A list joined the way the language joins one: `a, b and c`, `a, b et c`. */
  list(
    values: readonly string[] | Observable<readonly string[]>,
    options: Intl.ListFormatOptions = {}
  ): ComputedCell<string> {
    return computed(read => {
      const current = isObservable(values) ? (read(values) ?? []) : values;
      return new Intl.ListFormat(this.active.value.locale, options).format(current);
    });
  }

  /** A distance in time: `3 days ago`, `in 2 hours`. */
  relativeTime(
    value: number | Observable<number>,
    unit: Intl.RelativeTimeFormatUnit,
    options: Intl.RelativeTimeFormatOptions = { numeric: 'auto' }
  ): ComputedCell<string> {
    return computed(read => {
      const current = isObservable(value) ? (read(value) ?? 0) : value;
      return new Intl.RelativeTimeFormat(this.active.value.locale, options).format(current, unit);
    });
  }

  /** The first of `wanted` a catalog covers, falling back by subtag, or the source's language. */
  negotiate(wanted: readonly string[]): string {
    const covered = new Set(this.available.map(tag => tag.toLowerCase()));
    for (const tag of wanted) {
      for (const candidate of fallbackChain(tag)) {
        if (covered.has(candidate.toLowerCase())) {
          // The person's own tag, so `en-CA` keeps Canadian dates while
          // reading the `en` catalog.
          return tag;
        }
      }
    }
    return this.sourceLocale;
  }

  private formatNow(id: string, values: MessageValues, defaults: Catalog, active: Active): string {
    let message: CompiledMessage | null = null;
    let locale = active.locale;
    for (const catalog of active.catalogs) {
      message = this.compile(catalog, id);
      if (message !== null) {
        break;
      }
    }
    if (message === null) {
      // The source's words, so the source's rules: "0 items" under an
      // English plural even while the screen is in French.
      locale = this.sourceLocale;
      message = this.compile(defaults, id) ?? this.compile(this.options.source, id);
      if (message === null) {
        this.report(`no message "${id}"`);
        return id;
      }
      if (active.catalogs.length > 0 || active.locale !== this.sourceLocale) {
        this.report(`no "${active.locale}" message for "${id}"; showing the source`);
      }
    }
    return message.format(values, locale, problem => this.report(`${id}: ${problem}`));
  }

  private compile(catalog: Catalog, id: string): CompiledMessage | null {
    const source = catalog[id];
    if (source === undefined) {
      return null;
    }
    let byId = this.compiled.get(catalog);
    if (byId === undefined) {
      byId = new Map();
      this.compiled.set(catalog, byId);
    }
    let message = byId.get(id);
    if (message === undefined) {
      message = compileMessage(source);
      byId.set(id, message);
    }
    return message;
  }

  private report(problem: string): void {
    if (!this.reported.has(problem)) {
      this.reported.add(problem);
      this.onMissing(problem);
    }
  }
}

/** `fr-CA` → `fr-CA`, `fr`; `zh-Hant-TW` → `zh-Hant-TW`, `zh-Hant`, `zh`. */
export function fallbackChain(locale: string): string[] {
  const parts = locale.split('-');
  const chain: string[] = [];
  for (let length = parts.length; length > 0; length--) {
    chain.push(parts.slice(0, length).join('-'));
  }
  return chain;
}

const loaderIds = new WeakMap<object, number>();
let nextLoaderId = 0;

function cacheKey(tag: string, loader: object): string {
  let id = loaderIds.get(loader);
  if (id === undefined) {
    id = nextLoaderId++;
    loaderIds.set(loader, id);
  }
  return `${tag}#${id}`;
}

function directionOf(locale: string): 'ltr' | 'rtl' {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction?: string };
      textInfo?: { direction?: string };
    };
    const direction = info.getTextInfo?.().direction ?? info.textInfo?.direction;
    if (direction === 'rtl' || direction === 'ltr') {
      return direction;
    }
  } catch {
    // An unknown tag reads left to right, like the source.
  }
  return RTL_LANGUAGES.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr';
}

function readOne(value: MessageInput, read: ReadSource): MessageValue {
  return isObservable(value) ? read(value) : value;
}

function readAll(values: MessageInputs | undefined, read: ReadSource): MessageValues {
  if (values === undefined) {
    return {};
  }
  const out: Record<string, MessageValue> = {};
  for (const [name, value] of Object.entries(values)) {
    out[name] = readOne(value, read);
  }
  return out;
}

/** Where a subtree's strings come from. Read it with `i18nFrom(ctx)`. */
export const I18nKey: UiEnvironmentKey<I18n | null> = createEnvironmentKey<I18n | null>({
  name: 'gesso.i18n',
  defaultValue: null,
  compare: (a, b) => a === b
});

/** Gives a subtree its strings: `provide={[provideI18n(i18n)]}` on the root. */
export function provideI18n(i18n: I18n<Catalog>): UiProvision {
  return provided(I18nKey, i18n as I18n);
}

let platform: I18n | null = null;

/**
 * The strings a component is placed under: the `I18n` its root
 * provides, or, in an application that has none, one that follows the
 * platform's language for numbers and dates and shows each library's
 * own English.
 */
export function i18nFrom(ctx: { environment<T>(key: UiEnvironmentKey<T>): T }): I18n {
  const provided = ctx.environment(I18nKey);
  if (provided !== null) {
    return provided;
  }
  if (platform === null) {
    platform = new I18n({ source: {}, onMissing: () => {} });
    const wanted = (globalThis as { navigator?: { language?: string } }).navigator?.language;
    if (wanted !== undefined) {
      void platform.setLocale(wanted, { follow: true });
    }
  }
  return platform;
}
