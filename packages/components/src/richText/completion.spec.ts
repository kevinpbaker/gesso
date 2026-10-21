import { firstValueFrom, isObservable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  endsByDefault,
  filterOptions,
  mentionCompletions,
  queryAfter,
  referenceCompletions,
  triggerAt,
  type RichTextCompletionSource
} from './completion';

const mentions = mentionCompletions([
  { handle: 'ada', name: 'Ada Lovelace' },
  { handle: 'grace', name: 'Grace Hopper' }
]);
const references = referenceCompletions({ prefixes: ['WEB', 'API'], search: async () => [] });
const tags: RichTextCompletionSource = { trigger: { character: '#' }, label: 'Tag', options: [] };
const sources = [mentions, references, tags];
const prefixesOf = (index: number): readonly string[] => {
  const trigger = sources[index]!.trigger;
  return 'prefixes' in trigger && !isObservable(trigger.prefixes) ? trigger.prefixes : [];
};
/** The trigger the last character of `text` opens, typed with the caret after it. */
const typed = (text: string) => triggerAt(text, text.length, sources, prefixesOf);

describe('what opens a completion', () => {
  it('opens a character trigger where a word starts', () => {
    expect(typed('Thanks @')).toEqual({ source: 0, start: 7, opener: '@', prefix: '@' });
    expect(typed('#')).toEqual({ source: 2, start: 0, opener: '#', prefix: '#' });
    expect(typed('mail me@')).toBeNull();
    expect(typed('issue#')).toBeNull();
  });

  it('opens a prefix trigger at its separator, only where a key can start', () => {
    expect(typed('Duplicate of WEB-')).toEqual({ source: 1, start: 13, opener: 'WEB-', prefix: 'WEB' });
    expect(typed('(API-')).toEqual({ source: 1, start: 1, opener: 'API-', prefix: 'API' });
    expect(typed('xWEB-')).toBeNull();
    expect(typed('@WEB-')).toBeNull();
    expect(typed('XYZ-')).toBeNull();
    expect(typed('web-')).toBeNull();
  });

  it('takes the longest prefix that fits, so a short one inside a longer one is not taken', () => {
    const nested: RichTextCompletionSource = {
      trigger: { prefixes: ['B', 'AB'], separator: '-' },
      label: 'Keys',
      search: () => of([])
    };
    const at = (text: string) => triggerAt(text, text.length, [nested], () => ['B', 'AB']);
    expect(at('AB-')).toMatchObject({ prefix: 'AB', start: 0 });
    expect(at('B-')).toMatchObject({ prefix: 'B', start: 0 });
  });

  it('reads what follows the trigger, until the caret leaves it or the trigger goes', () => {
    const trigger = { start: 3, opener: '@' };
    expect(queryAfter('hi @ad', 6, trigger)).toBe('ad');
    expect(queryAfter('hi @ad', 3, trigger)).toBeNull();
    expect(queryAfter('hi ad', 5, trigger)).toBeNull();
    expect(queryAfter('hi @a\nd', 7, trigger)).toBeNull();
  });
});

describe('when a completion closes', () => {
  it('closes by default on a space straight after the trigger, or punctuation that matches nothing', () => {
    expect(endsByDefault(' ', 3)).toBe(true);
    expect(endsByDefault('kim ', 1)).toBe(false);
    expect(endsByDefault('kim said ', 0)).toBe(true);
    expect(endsByDefault('a.', 0)).toBe(true);
    // A search's count isn't known when it's asked.
    expect(endsByDefault('a.', null)).toBe(false);
  });

  it('closes a reference at anything but a letter or a digit', () => {
    expect(references.ends!('12', null)).toBe(false);
    expect(references.ends!('rate', null)).toBe(false);
    expect(references.ends!('12 ', null)).toBe(true);
  });
});

describe('the ready-made sources', () => {
  it('filters people by name and handle, as typed, and writes the handle', async () => {
    const options = mentions.options!;
    const list = isObservable(options) ? await firstValueFrom(options) : options;
    expect(filterOptions(list, 'h').map(s => s.label)).toEqual(['Grace Hopper']);
    expect(filterOptions(list, 'a').map(s => s.label)).toEqual(['Ada Lovelace', 'Grace Hopper']);
    expect(filterOptions(list, 'grace')[0]).toEqual({ value: 'grace', label: 'Grace Hopper', detail: '@grace' });
    expect(mentions.insert!({ value: 'ada', label: 'Ada Lovelace' })).toBe('@ada');
    expect(mentions.announce!({ value: 'ada', label: 'Ada Lovelace' })).toBe('Mentioned Ada Lovelace');
  });

  it('follows a list of people that changes', async () => {
    const options = mentionCompletions(of([{ handle: 'kim', name: 'Kim Nguyen' }])).options;
    expect(isObservable(options)).toBe(true);
    expect(isObservable(options) ? await firstValueFrom(options) : options).toEqual([
      { value: 'kim', label: 'Kim Nguyen', detail: '@kim', keywords: ['kim'] }
    ]);
  });

  it('writes a reference as its key, and says it linked it', () => {
    expect(references.insert).toBeUndefined();
    expect(references.announce!({ value: 'WEB-12', label: 'WEB-12' })).toBe('Linked WEB-12');
    expect(references.label).toBe('Link an issue');
    expect(mentions.label).toBe('Mention someone');
  });
});
