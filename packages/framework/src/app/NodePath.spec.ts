import { describe, expect, it } from 'vitest';

import { Button, Column, UiEventType, UiPointerEvent, type UiElement, type UiNode } from '@gesso/core';
import { Component } from '../Component';
import { Define } from '../decorators';
import { createComponent } from '../createComponent';
import { formatNodePath } from './NodeReport';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * `(listener: click on node-4821)` becomes
 * a path through the components somebody wrote.
 *
 * An id is a handle beside the tree it came from, and a fact about
 * nothing in a console or an overlay, which is where a listener error
 * is read.
 */
describe('formatNodePath', () => {
  it('reads outermost first, whichever way the owners came', () => {
    const owners = [
      { name: 'Button', anchorId: 'a4' },
      { name: 'ActionRow', anchorId: 'a3' },
      { name: 'TrackScreen', anchorId: 'a2' },
      { name: 'App', anchorId: 'a1' }
    ];

    expect(formatNodePath(owners, { type: 'box', id: 'node-4821', label: 'Like' })).toBe(
      'App > TrackScreen > ActionRow > Button "Like"'
    );
  });

  it('leaves the name off when the node has none', () => {
    expect(formatNodePath([{ name: 'Row', anchorId: 'a1' }], { type: 'box', id: 'node-9' })).toBe('Row');
  });

  it('falls back to the id when no component rendered it', () => {
    expect(formatNodePath([], { type: 'box', id: 'node-9' })).toBe('box node-9');
    expect(formatNodePath([], { type: 'box', id: 'node-9', label: 'Like' })).toBe('box "Like"');
  });
});

@Define('inner-row')
class InnerRow extends Component {
  override render(): UiElement {
    return Button({
      label: 'Like',
      onClick: () => {
        throw new Error('nope');
      }
    });
  }
}

@Define('screen')
class Screen extends Component {
  override render(): UiElement {
    return Column({}, createComponent(InnerRow));
  }
}

describe('a listener that throws', () => {
  it('is reported against the path rather than the node id', () => {
    const reported: string[] = [];
    const mounted = mountRuntime(createComponent(Screen), {
      onCreate: runtime => runtime.onListenerError(message => reported.push(message))
    });
    mounted.frame();

    const button = labelled(mounted.runtime.debugRoot(), 'Like');
    mounted.runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), button);

    // `inner-row` rather than `InnerRow`: the name is the owner's, and
    // an owner's name is its `@Define` tag where it has one, which is
    // what the inspector shows too. A function component, which is what
    // the documentation teaches, reads as its function name.
    expect(reported).toEqual(['nope (listener: click on inner-row "Like")']);
  });
});

/** The node carrying a label, wherever the component put it. */
function labelled(node: UiNode, label: string): UiNode {
  if (node.getProperty('label') === label) {
    return node;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = find(child, label);
    if (found !== null) {
      return found;
    }
  }
  throw new Error(`No node labelled ${label}.`);
}

function find(node: UiNode, label: string): UiNode | null {
  if (node.getProperty('label') === label) {
    return node;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = find(child, label);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
