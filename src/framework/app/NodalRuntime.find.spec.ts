import { describe, expect, it } from 'vitest';

import { Button, Column, Text } from '../../ui/composition/UiComponents';
import type { UiElement } from '../../ui/composition/UiElement';
import { noKeyModifiers, type UiKeyModifiers } from '../../ui/input/UiInputEvent';
import { matchRangesOf } from '../../ui/find/UiTextMatches';
import { selectionRangeOf } from '../../ui/selection/UiSelectable';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { UiManualFrameClock } from '../../ui/scheduler';
import { FindStore } from './FindStore';
import { NodalRuntime } from './NodalRuntime';
import { mockCanvas } from './RuntimeTestUtils';

/** 7px per character, so an offset's x is 7 × offset in the default 14px font. */

const ctrl = (): UiKeyModifiers => ({ ...noKeyModifiers(), ctrl: true });

function mount(root: UiElement) {
  let clock!: UiManualFrameClock;
  const runtime = new NodalRuntime({
    root,
    canvas: mockCanvas(800, 600),
    width: 800,
    height: 600,
    clock: cb => (clock = new UiManualFrameClock(cb))
  });
  runtime.start();
  const tick = (): void => {
    if (clock.isPending) {
      clock.tick(16);
    }
  };
  tick();
  const texts: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.type === UiNodeType.Text) {
      texts.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(runtime.debugRoot());
  return {
    runtime,
    tick,
    texts,
    find: runtime.input.find,
    store: runtime.stores.get(FindStore),
    key: (name: string, modifiers: UiKeyModifiers = noKeyModifiers()) => runtime.input.keyboard.keyDown(name, modifiers)
  };
}

/** 'the' occurs once in the first line and once in the second, and not at all in the third. */
const page = (): UiElement =>
  Column(
    { x: 'start' },
    Text({ text: 'the first line' }),
    Text({ text: 'a line with the word' }),
    Text({ text: 'nothing here' })
  );

describe('NodalRuntime find', () => {
  it('opens and closes a session on the platform shortcut', () => {
    const { find, store, key } = mount(page());
    expect(find.isOpen).toBe(false);

    const opened = key('f', ctrl());
    expect(opened.defaultPrevented).toBe(true);
    expect(find.isOpen).toBe(true);
    expect(store.open.value).toBe(true);

    const closed = key('Escape');
    expect(closed.defaultPrevented).toBe(true);
    expect(find.isOpen).toBe(false);
    expect(store.open.value).toBe(false);
  });

  it('leaves Escape to the selection when no session is running', () => {
    const { key } = mount(page());
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('highlights every match and selects the first', () => {
    const { find, store, texts } = mount(page());
    expect(find.search('the')).toBe(2);
    expect(store.matchCount.value).toBe(2);
    expect(store.activeMatch.value).toBe(1);

    expect(matchRangesOf(texts[0])).toEqual([{ start: 0, end: 3 }]);
    expect(matchRangesOf(texts[1])).toEqual([{ start: 12, end: 15 }]);
    expect(matchRangesOf(texts[2])).toBeUndefined();
    // The active match is a real selection, so copy takes it.
    expect(selectionRangeOf(texts[0])).toEqual({ start: 0, end: 3 });
    expect(find.matches[0].node).toBe(texts[0]);
  });

  it('steps through matches, wrapping around, moving the selection with it', () => {
    const { find, store, texts } = mount(page());
    find.search('the');

    find.next();
    expect(store.activeMatch.value).toBe(2);
    expect(selectionRangeOf(texts[1])).toEqual({ start: 12, end: 15 });
    expect(selectionRangeOf(texts[0])).toBeUndefined();

    find.next();
    expect(store.activeMatch.value).toBe(1);
    find.previous();
    expect(store.activeMatch.value).toBe(2);
  });

  it('is case-insensitive unless asked otherwise', () => {
    const { find } = mount(Column({ x: 'start' }, Text({ text: 'The the THE' })));
    expect(find.search('the')).toBe(3);
    expect(find.search('the', { matchCase: true })).toBe(1);
  });

  it('drops the highlights when the query is cleared', () => {
    const { find, texts } = mount(page());
    find.search('the');
    expect(find.search('')).toBe(0);
    expect(matchRangesOf(texts[0])).toBeUndefined();
    expect(matchRangesOf(texts[1])).toBeUndefined();
  });

  it('closing a session drops the matches with it', () => {
    const { find, store, texts } = mount(page());
    find.search('the');
    find.open();
    find.close();
    expect(find.matchCount).toBe(0);
    expect(store.query.value).toBe('');
    expect(matchRangesOf(texts[0])).toBeUndefined();
  });

  it('does not match a button label, which is not selectable text', () => {
    const { find } = mount(Column({ x: 'start' }, Text({ text: 'the page' }), Button({ text: 'the button' })));
    expect(find.search('the')).toBe(1);
  });

  it('drives the same search through the store a component injects', () => {
    const { store, texts } = mount(page());
    store.search('the');
    expect(store.matchCount.value).toBe(2);
    store.next();
    expect(store.activeMatch.value).toBe(2);
    store.close();
    expect(store.matchCount.value).toBe(0);
    expect(matchRangesOf(texts[1])).toBeUndefined();
  });
});
