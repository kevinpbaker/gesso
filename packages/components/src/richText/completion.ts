import { isObservable, map, type Observable } from 'rxjs';

import { filterCombobox } from '../Combobox';
import { keyStart, wordStart, type RichTextToken } from './inline';

/**
 * Completing something as it's typed: a mention, an issue reference,
 * anything an application can list.
 *
 * The editor knows nothing about people or issues. Whoever puts it on
 * a page hands it completion sources, and each says three things: what
 * opens its list (a character such as `@` at the start of a word, or
 * one of a set of prefixes followed by a separator, such as a team's key
 * and a dash), where its suggestions come from (a list the editor
 * filters as it's typed, or a search that answers when it's ready), and
 * what a pick writes and how that text is drawn afterwards. Without
 * sources, nothing opens.
 *
 * `mentionCompletions` and `referenceCompletions` are the two the issue
 * tracker this editor grew in needed, ready-made. Plain logic here, so
 * the rules are tested without a frame.
 */

/** One thing to pick: what it inserts, and how it reads in the list. */
export interface RichTextSuggestion {
  readonly value: string;
  readonly label: string;
  /** A quieter second part: a handle, an issue's title. */
  readonly detail?: string;
}

/** A suggestion the editor filters itself, with the other words it answers to. */
export interface RichTextOption extends RichTextSuggestion {
  readonly keywords?: readonly string[];
}

/**
 * What opens a source's list. Only a character typed opens one; text
 * pasted, or a caret moved past it, does not.
 *
 * - `character`: typed where a word starts, as `@` is. `me@x.dev` opens
 *   nothing.
 * - `prefixes` and `separator`: the separator typed straight after one
 *   of the prefixes, where a key can start (see `keyStart`): `WEB-`,
 *   `(WEB-`, but not `xWEB-` or `@WEB-`.
 */
export type RichTextTrigger =
  | { readonly character: string }
  | { readonly prefixes: readonly string[] | Observable<readonly string[]>; readonly separator: string };

/** What a search is asked: the prefix that opened it (or the character), and what's typed after. */
export interface RichTextSearch {
  readonly prefix: string;
  readonly query: string;
}

/** A key the editor handles itself, for an application's list of shortcuts. */
export interface RichTextShortcut {
  /** In `UiShortcuts` notation, `Mod+B`, or the characters typed, `@`. */
  readonly keys: string;
  readonly label: string;
}

interface SourceBase {
  /** What opens the list. */
  readonly trigger: RichTextTrigger;
  /** The list's name, read when it opens: "Mention someone". */
  readonly label: string;
  /** Shown when nothing matches. Default "No matches". */
  readonly empty?: string;
  /** The list's width. Default 300. */
  readonly width?: number;
  /** What a pick writes in place of the trigger and the query. Default the suggestion's value. A space follows it. */
  readonly insert?: (suggestion: RichTextSuggestion) => string;
  /** What a screen reader hears once a pick is written. Default "Inserted" and the label. */
  readonly announce?: (suggestion: RichTextSuggestion) => string;
  /**
   * Whether the list should close as the query stands. `matches` is how
   * many suggestions the query has, or null for a search, which is
   * asked only once this says no. Default: a space straight after the
   * trigger, or punctuation that leaves nothing matching (see
   * `endsByDefault`).
   */
  readonly ends?: (query: string, matches: number | null) => boolean;
  /** How what a pick writes is drawn in the text from then on: as a chip. */
  readonly token?: RichTextToken;
  /** The source's line in `richTextShortcuts`. */
  readonly shortcut?: RichTextShortcut;
}

/**
 * Where a source's suggestions come from: `options`, filtered here as
 * typed (best for dozens, a team's people), or `search`, answered when
 * it's ready (for thousands, matched somewhere else). A search's answer
 * to a query typed past is dropped; each value it sends is a full
 * answer, and the last one stays up until the next arrives.
 */
export type RichTextCompletionSource = SourceBase &
  (
    | {
        readonly options: readonly RichTextOption[] | Observable<readonly RichTextOption[]>;
        readonly search?: undefined;
      }
    | {
        readonly search: (
          ask: RichTextSearch
        ) => Observable<readonly RichTextSuggestion[]> | PromiseLike<readonly RichTextSuggestion[]>;
        readonly options?: undefined;
      }
  );

/** An open trigger: whose it is, where it starts, and what was typed for it. */
export interface Trigger {
  /** The source's index in the editor's list. */
  readonly source: number;
  readonly start: number;
  /** `@`, or the prefix and its separator: what the query follows. */
  readonly opener: string;
  /** What a search is asked with: the prefix without its separator, or the character. */
  readonly prefix: string;
}

/** How many suggestions the list shows. */
export const SHOWN = 8;

/**
 * The completion the character just typed opens, if any, trying the
 * sources in order. `prefixesOf` gives each prefix source's prefixes as
 * they stand.
 */
export function triggerAt(
  text: string,
  caret: number,
  sources: readonly RichTextCompletionSource[],
  prefixesOf: (source: number) => readonly string[]
): Trigger | null {
  const before = text.slice(0, caret);
  for (let index = 0; index < sources.length; index++) {
    const trigger = sources[index]!.trigger;
    if ('character' in trigger) {
      const opener = trigger.character;
      const start = caret - opener.length;
      if (opener !== '' && before.endsWith(opener) && wordStart(text, start)) {
        return { source: index, start, opener, prefix: opener };
      }
      continue;
    }
    if (trigger.separator === '' || !before.endsWith(trigger.separator)) {
      continue;
    }
    // The longest first, so `WEBX-` is not taken for a prefix `X`.
    const prefixes = [...prefixesOf(index)].sort((a, b) => b.length - a.length);
    for (const prefix of prefixes) {
      const opener = prefix + trigger.separator;
      const start = caret - opener.length;
      if (prefix !== '' && before.endsWith(opener) && keyStart(text, start)) {
        return { source: index, start, opener, prefix };
      }
    }
  }
  return null;
}

/**
 * What's typed after an open trigger, up to the caret, or null when the
 * completion no longer stands: the caret left it, or the trigger was
 * edited away.
 */
export function queryAfter(text: string, caret: number, trigger: Pick<Trigger, 'start' | 'opener'>): string | null {
  const from = trigger.start + trigger.opener.length;
  if (caret < from || text.slice(trigger.start, from) !== trigger.opener) {
    return null;
  }
  const query = text.slice(from, caret);
  return query.includes('\n') ? null : query;
}

/** The options a query matches, best first: a label's start, a word's, anywhere, then a keyword. */
export function filterOptions(options: readonly RichTextOption[], query: string): RichTextSuggestion[] {
  return filterCombobox(options, query.trim())
    .slice(0, SHOWN)
    .map(option =>
      option.detail === undefined
        ? { value: option.value, label: option.label }
        : { value: option.value, label: option.label, detail: option.detail }
    );
}

/**
 * Whether the list should close as the query stands, for a source that
 * says nothing else: the last thing typed was a space or punctuation and
 * nothing matches, or a space came straight after the trigger. A space
 * alone doesn't end it, so `@Ada L` still finds Ada Lovelace, but
 * `@ada said ` closes at the space after "said".
 */
export function endsByDefault(query: string, matches: number | null): boolean {
  if (/^\s/.test(query)) {
    // `@ ` is an at sign, not a mention.
    return true;
  }
  return matches !== null && query !== '' && /[^\p{L}\p{N}]$/u.test(query) && matches === 0;
}

/** Someone `@` can mention. */
export interface RichTextMentionable {
  /** What's written after the `@`: lower case, as the mention token reads it. */
  readonly handle: string;
  readonly name: string;
}

/** A mention as text: `@` and a lower-case handle. */
const MENTION_TOKEN: RichTextToken = { sigil: '@', pattern: /[a-z][a-z0-9_-]*/ };

/** An issue key as text: two to five capitals, a dash and a number, where a key can start. */
const REFERENCE_TOKEN: RichTextToken = { pattern: /[A-Z]{2,5}-\d+\b/, startsAt: keyStart };

/**
 * People to mention after `@`, filtered by name and handle as typed: a
 * workspace has dozens, not thousands. A pick writes `@handle`, drawn
 * as a chip. To change a word of it, spread it: `{ ...mentionCompletions(people), label: 'Assign' }`.
 */
export function mentionCompletions(
  people: readonly RichTextMentionable[] | Observable<readonly RichTextMentionable[]>
): RichTextCompletionSource {
  const options = (list: readonly RichTextMentionable[]): RichTextOption[] =>
    list.map(person => ({
      value: person.handle,
      label: person.name,
      detail: `@${person.handle}`,
      keywords: [person.handle]
    }));
  return {
    trigger: { character: '@' },
    options: isObservable(people) ? people.pipe(map(options)) : options(people),
    label: 'Mention someone',
    empty: 'No one matches',
    width: 260,
    insert: suggestion => `@${suggestion.value}`,
    announce: suggestion => `Mentioned ${suggestion.label}`,
    token: MENTION_TOKEN,
    shortcut: { keys: '@', label: 'Mention someone' }
  };
}

export interface RichTextReferenceOptions {
  /** The keys that start a reference, `WEB`: typed with a dash after them, they open the list. */
  readonly prefixes: readonly string[] | Observable<readonly string[]>;
  /**
   * The issues under `prefix` matching `query`, the text typed after its
   * dash: a number to match keys, words to match titles, nothing for the
   * latest. Each suggestion's value is the key a pick writes.
   */
  readonly search: (
    ask: RichTextSearch
  ) => Observable<readonly RichTextSuggestion[]> | PromiseLike<readonly RichTextSuggestion[]>;
}

/**
 * Issue references after a key and a dash (`WEB-`), searched by number
 * or by a word of the title. A reference is a number or one word, which
 * nothing but a letter or a digit continues, so the list closes at the
 * first anything else: `WEB-12 ` is a reference written out. A pick
 * writes the key, drawn as a chip.
 */
export function referenceCompletions(options: RichTextReferenceOptions): RichTextCompletionSource {
  return {
    trigger: { prefixes: options.prefixes, separator: '-' },
    search: options.search,
    label: 'Link an issue',
    empty: 'No issues match',
    width: 360,
    announce: suggestion => `Linked ${suggestion.label}`,
    ends: query => /[^A-Za-z0-9]/.test(query),
    token: REFERENCE_TOKEN,
    shortcut: { keys: 'KEY-', label: 'Link an issue: its key and a dash' }
  };
}
