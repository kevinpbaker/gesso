// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineChannel } from 'gesso-framework';
import type { ServedChannel } from 'gesso-framework/embed';
import type { Observable } from 'rxjs';

import { useHostChannel } from './useHostChannel';

/**
 * `useHostChannel` turns a render's values into a channel's view and
 * its callbacks into the channel's commands. The served channel is read
 * here the way `provide` reads it: an observable per view key and a
 * function per command.
 */
const Filter = defineChannel('filter', {
  view: { text: '', sort: 'name' as 'name' | 'date' },
  commands: {} as { open(id: string): void }
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

interface Harness {
  served: ServedChannel[];
  setText: (text: string) => void;
  opened: string[];
}

function mount(): Harness {
  const harness: Harness = { served: [], setText: () => {}, opened: [] };
  function Host() {
    const [text, setText] = useState('pears');
    harness.setText = setText;
    // A closure over `text`: the command must see the latest one.
    harness.served.push(
      useHostChannel(Filter, { text, sort: 'name' }, { open: id => harness.opened.push(`${id}@${text}`) })
    );
    return null;
  }
  act(() => root.render(createElement(Host)));
  return harness;
}

function values<T>(observable: Observable<T>): T[] {
  const seen: T[] = [];
  observable.subscribe(value => seen.push(value));
  return seen;
}

describe('useHostChannel', () => {
  it('serves the first render as the view, and the same channel on every render after', () => {
    const harness = mount();
    act(() => harness.setText('plums'));

    expect(harness.served.length).toBeGreaterThan(1);
    expect(new Set(harness.served).size).toBe(1);
  });

  it('sends a changed value, and leaves an unchanged one alone', () => {
    const harness = mount();
    const source = harness.served[0]!.source as { view: { text: Observable<string>; sort: Observable<string> } };
    const texts = values(source.view.text);
    const sorts = values(source.view.sort);

    act(() => harness.setText('plums'));

    expect(texts).toEqual(['pears', 'plums']);
    expect(sorts).toEqual(['name']);
  });

  it("calls the latest render's callback for a command", () => {
    const harness = mount();
    const commands = harness.served[0]!.source.commands as { open(id: string): void };

    act(() => harness.setText('plums'));
    commands.open('row-3');

    expect(harness.opened).toEqual(['row-3@plums']);
  });
});
