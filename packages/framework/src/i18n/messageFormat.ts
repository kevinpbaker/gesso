/**
 * ICU MessageFormat, the part of it an application's strings use.
 *
 * A message is text with arguments in braces:
 *
 *   'Hello, {name}'
 *   '{count, plural, =0 {Your cart is empty} one {# item} other {# items}}'
 *   '{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}'
 *   '{role, select, admin {Administrator} other {Member}}'
 *   'Total: {total, number, ::currency/CAD}'
 *   'Placed on {when, date, medium} at {when, time, short}'
 *
 * That is ICU's syntax, so a catalog written here is a catalog every
 * translation tool reads and writes. What is not here (`offset:` in a
 * plural, `spellout`, `duration`, number patterns rather than skeletons)
 * is refused when the message is compiled, with the message and the
 * place, rather than formatted wrongly later.
 *
 * Underneath it is the platform's `Intl`, which exists in every worker:
 * `PluralRules` decides `one` from `few`, and `NumberFormat` and
 * `DateTimeFormat` write numbers and dates the way the locale writes
 * them. Nothing here holds locale data of its own.
 */

/** What a message's argument may be given. */
export type MessageValue = string | number | boolean | Date | null | undefined;

/** The arguments one message is formatted with. */
export type MessageValues = Readonly<Record<string, MessageValue>>;

/** A message that cannot be compiled, naming where. */
export class MessageFormatError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly offset: number
  ) {
    super(`${message} at ${offset} in "${source}"`);
    this.name = 'MessageFormatError';
  }
}

type Part =
  | string
  | { readonly kind: 'arg'; readonly name: string }
  | { readonly kind: 'pound' }
  | { readonly kind: 'number'; readonly name: string; readonly options: Intl.NumberFormatOptions }
  | { readonly kind: 'date'; readonly name: string; readonly time: boolean; readonly style: DateStyle }
  | {
      readonly kind: 'plural';
      readonly name: string;
      readonly ordinal: boolean;
      readonly exact: ReadonlyMap<number, readonly Part[]>;
      readonly cases: Readonly<Record<string, readonly Part[]>>;
    }
  | { readonly kind: 'select'; readonly name: string; readonly cases: Readonly<Record<string, readonly Part[]>> };

type DateStyle = 'short' | 'medium' | 'long' | 'full';

/** A compiled message: format it as often as you like. */
export interface CompiledMessage {
  /** The argument names the message reads, for a check that each was given. */
  readonly names: readonly string[];
  format(values: MessageValues, locale: string, problems?: (problem: string) => void): string;
}

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const DATE_STYLES = new Set<string>(['short', 'medium', 'long', 'full']);

/** Compiles one message, or throws a `MessageFormatError` saying what is wrong with it. */
export function compileMessage(source: string): CompiledMessage {
  const parser = new Parser(source);
  const parts = parser.message();
  if (parser.at < source.length) {
    throw new MessageFormatError('Unmatched "}"', source, parser.at);
  }
  const names = new Set<string>();
  collectNames(parts, names);
  return {
    names: [...names],
    format: (values, locale, problems) => formatParts(parts, values, locale, null, problems).join('')
  };
}

class Parser {
  at = 0;
  /** How many plurals the parser is inside: in any of them, `#` is the plural's number. */
  private plurals = 0;

  constructor(readonly source: string) {}

  /** Text and arguments up to the end, or up to the `}` that closes the case being read. */
  message(): Part[] {
    const pound = this.plurals > 0;
    const parts: Part[] = [];
    let text = '';
    const flush = (): void => {
      if (text !== '') {
        parts.push(text);
        text = '';
      }
    };
    while (this.at < this.source.length) {
      const char = this.source[this.at]!;
      if (char === "'") {
        text += this.quoted(pound);
      } else if (char === '{') {
        flush();
        parts.push(this.argument());
      } else if (char === '}') {
        break;
      } else if (char === '#' && pound) {
        flush();
        parts.push({ kind: 'pound' });
        this.at++;
      } else {
        text += char;
        this.at++;
      }
    }
    flush();
    return parts;
  }

  /**
   * An apostrophe: `''` is one apostrophe, and one before a `{`, a `}`
   * (or a `#` inside a plural) starts a literal that runs to the next
   * single apostrophe. Any other apostrophe is itself, so "don't" needs
   * no escaping.
   */
  private quoted(pound: boolean): string {
    const next = this.source[this.at + 1];
    if (next === "'") {
      this.at += 2;
      return "'";
    }
    if (next === '{' || next === '}' || (pound && next === '#')) {
      let literal = '';
      this.at++;
      while (this.at < this.source.length) {
        const char = this.source[this.at]!;
        if (char === "'") {
          if (this.source[this.at + 1] === "'") {
            literal += "'";
            this.at += 2;
            continue;
          }
          this.at++;
          return literal;
        }
        literal += char;
        this.at++;
      }
      throw new MessageFormatError('Unclosed quoted literal', this.source, this.at);
    }
    this.at++;
    return "'";
  }

  private argument(): Part {
    const start = this.at;
    this.at++; // {
    this.space();
    const name = this.word();
    if (name === '') {
      throw new MessageFormatError('Expected an argument name', this.source, this.at);
    }
    this.space();
    if (this.eat('}')) {
      return { kind: 'arg', name };
    }
    if (this.at >= this.source.length) {
      throw new MessageFormatError('Unclosed argument', this.source, start);
    }
    this.expect(',');
    this.space();
    const type = this.word();
    this.space();
    switch (type) {
      case 'number':
        return { kind: 'number', name, options: this.numberStyle() };
      case 'date':
      case 'time':
        return { kind: 'date', name, time: type === 'time', style: this.dateStyle() };
      case 'plural':
      case 'selectordinal':
        return this.plural(name, type === 'selectordinal');
      case 'select':
        return { kind: 'select', name, cases: this.cases(false).cases };
      default:
        throw new MessageFormatError(
          type === '' ? 'Expected an argument type' : `Unsupported argument type "${type}"`,
          this.source,
          start
        );
    }
  }

  private numberStyle(): Intl.NumberFormatOptions {
    if (this.eat('}')) {
      return {};
    }
    this.expect(',');
    this.space();
    const start = this.at;
    let style = '';
    while (this.at < this.source.length && this.source[this.at] !== '}') {
      style += this.source[this.at];
      this.at++;
    }
    this.expect('}');
    style = style.trim();
    if (style === 'integer') {
      return { maximumFractionDigits: 0 };
    }
    if (style === 'percent') {
      return { style: 'percent' };
    }
    if (style.startsWith('::')) {
      return skeleton(style.slice(2).trim(), this.source, start);
    }
    throw new MessageFormatError(`Unsupported number style "${style}"`, this.source, start);
  }

  private dateStyle(): DateStyle {
    if (this.eat('}')) {
      return 'medium';
    }
    this.expect(',');
    this.space();
    const start = this.at;
    const style = this.word();
    this.space();
    this.expect('}');
    if (!DATE_STYLES.has(style)) {
      throw new MessageFormatError(`Unsupported date style "${style}"`, this.source, start);
    }
    return style as DateStyle;
  }

  private plural(name: string, ordinal: boolean): Part {
    if (/^,\s*offset:/u.test(this.source.slice(this.at))) {
      throw new MessageFormatError('"offset:" is not supported', this.source, this.at);
    }
    this.plurals++;
    const { exact, cases } = this.cases(true);
    this.plurals--;
    for (const key of Object.keys(cases)) {
      if (!PLURAL_CATEGORIES.has(key)) {
        throw new MessageFormatError(`"${key}" is not a plural category`, this.source, this.at);
      }
    }
    return { kind: 'plural', name, ordinal, exact, cases };
  }

  /** `, key {message} key {message} … }`, ending past the closing brace. */
  private cases(allowExact: boolean): { exact: Map<number, readonly Part[]>; cases: Record<string, readonly Part[]> } {
    this.expect(',');
    const exact = new Map<number, readonly Part[]>();
    const cases: Record<string, readonly Part[]> = {};
    this.space();
    while (!this.eat('}')) {
      if (this.at >= this.source.length) {
        throw new MessageFormatError('Unclosed argument', this.source, this.at);
      }
      const start = this.at;
      let key: string;
      if (this.eat('=')) {
        if (!allowExact) {
          throw new MessageFormatError('"=" cases belong to a plural', this.source, start);
        }
        key = `=${this.word()}`;
      } else {
        key = this.word();
      }
      if (key === '' || key === '=') {
        throw new MessageFormatError('Expected a case', this.source, start);
      }
      this.space();
      this.expect('{');
      const body = this.message();
      this.expect('}');
      if (key.startsWith('=')) {
        const value = Number(key.slice(1));
        if (!Number.isFinite(value)) {
          throw new MessageFormatError(`"${key}" is not a number`, this.source, start);
        }
        exact.set(value, body);
      } else {
        cases[key] = body;
      }
      this.space();
    }
    if (cases['other'] === undefined) {
      throw new MessageFormatError('A plural or select needs an "other" case', this.source, this.at);
    }
    return { exact, cases };
  }

  private word(): string {
    const start = this.at;
    while (this.at < this.source.length && /[^\s{}=,#']/u.test(this.source[this.at]!)) {
      this.at++;
    }
    return this.source.slice(start, this.at);
  }

  private space(): void {
    while (this.at < this.source.length && /\s/u.test(this.source[this.at]!)) {
      this.at++;
    }
  }

  private eat(char: string): boolean {
    if (this.source[this.at] === char) {
      this.at++;
      return true;
    }
    return false;
  }

  private expect(char: string): void {
    if (!this.eat(char)) {
      throw new MessageFormatError(`Expected "${char}"`, this.source, this.at);
    }
  }
}

/**
 * The number skeletons an application's strings use, as `Intl` options:
 * `currency/CAD`, `percent`, `compact-short`, `compact-long`,
 * `precision-integer`, `.00` and `.0#` for fraction digits, `group-off`
 * and `sign-always`, separated by spaces.
 */
function skeleton(text: string, source: string, offset: number): Intl.NumberFormatOptions {
  const options: Intl.NumberFormatOptions = {};
  for (const token of text.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith('currency/')) {
      options.style = 'currency';
      options.currency = token.slice('currency/'.length);
    } else if (token === 'percent') {
      options.style = 'percent';
    } else if (token === 'compact-short' || token === 'compact-long') {
      options.notation = 'compact';
      options.compactDisplay = token === 'compact-short' ? 'short' : 'long';
    } else if (token === 'precision-integer') {
      options.maximumFractionDigits = 0;
    } else if (/^\.0*#*$/u.test(token)) {
      const zeros = token.match(/0/gu)?.length ?? 0;
      options.minimumFractionDigits = zeros;
      options.maximumFractionDigits = token.length - 1;
    } else if (token === 'group-off') {
      options.useGrouping = false;
    } else if (token === 'sign-always') {
      options.signDisplay = 'always';
    } else {
      throw new MessageFormatError(`Unsupported number skeleton "${token}"`, source, offset);
    }
  }
  return options;
}

function collectNames(parts: readonly Part[], into: Set<string>): void {
  for (const part of parts) {
    if (typeof part === 'string' || part.kind === 'pound') {
      continue;
    }
    into.add(part.name);
    if (part.kind === 'plural') {
      for (const body of part.exact.values()) {
        collectNames(body, into);
      }
    }
    if (part.kind === 'plural' || part.kind === 'select') {
      for (const body of Object.values(part.cases)) {
        collectNames(body, into);
      }
    }
  }
}

function formatParts(
  parts: readonly Part[],
  values: MessageValues,
  locale: string,
  count: { readonly value: number; readonly locale: string } | null,
  problems: ((problem: string) => void) | undefined
): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      out.push(part);
      continue;
    }
    if (part.kind === 'pound') {
      out.push(count === null ? '#' : numberFormat(locale, {}).format(count.value));
      continue;
    }
    const value = values[part.name];
    if (value === undefined) {
      problems?.(`no value for "${part.name}"`);
      out.push(`{${part.name}}`);
      continue;
    }
    switch (part.kind) {
      case 'arg':
        out.push(plainText(value, locale));
        break;
      case 'number':
        out.push(numberFormat(locale, part.options).format(toNumber(value)));
        break;
      case 'date':
        out.push(formatDateValue(value, locale, part.time ? { timeStyle: part.style } : { dateStyle: part.style }));
        break;
      case 'plural': {
        const n = toNumber(value);
        const body =
          part.exact.get(n) ?? part.cases[pluralRules(locale, part.ordinal).select(n)] ?? part.cases['other']!;
        out.push(...formatParts(body, values, locale, { value: n, locale }, problems));
        break;
      }
      case 'select': {
        const body = part.cases[String(value)] ?? part.cases['other']!;
        out.push(...formatParts(body, values, locale, count, problems));
        break;
      }
    }
  }
  return out;
}

function plainText(value: Exclude<MessageValue, undefined>, locale: string): string {
  if (typeof value === 'number') {
    return numberFormat(locale, {}).format(value);
  }
  if (value instanceof Date) {
    return formatDateValue(value, locale, { dateStyle: 'medium' });
  }
  return value === null ? '' : String(value);
}

function toNumber(value: Exclude<MessageValue, undefined>): number {
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return Number(value);
}

// ---- Intl, cached ----

const cache = new Map<string, unknown>();

function cached<T>(key: string, make: () => T): T {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) {
    return hit;
  }
  const made = make();
  cache.set(key, made);
  return made;
}

/** A `NumberFormat` for these options, made once per locale and options. */
export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options));
}

/** A `DateTimeFormat` for these options, made once per locale and options. */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options));
}

function pluralRules(locale: string, ordinal: boolean): Intl.PluralRules {
  return cached(
    `p|${locale}|${ordinal}`,
    () => new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' })
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Formats a date given as a `Date`, epoch milliseconds, or an ISO
 * string.
 *
 * A date with no time, `2026-11-27`, is a calendar day rather than an
 * instant, so it is formatted in UTC and reads as the 27th wherever the
 * person is. Read as an instant at local midnight it would be the 26th
 * west of Greenwich, which is the bug every date picker has once.
 */
export function formatDateValue(
  value: Exclude<MessageValue, undefined>,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  if (value === null || typeof value === 'boolean') {
    return '';
  }
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : dateFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateFormat(locale, options).format(date);
}
