import { describe, expect, it, vi } from 'vitest';

import { Box, Column } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { noKeyModifiers, UiEventType, UiKeyboardEvent, UiPointerEvent } from '../input/UiInputEvent';
import { UiShortcutRegistry } from '../input/UiShortcuts';
import { contextMenu, shortcut, shortcuts } from './shortcuts';

function build(root: UiChild) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher });
  builder.reconcileChildren(graph.root, [root]);
  const key = (name: string, ctrl = false, target: UiNode = graph.root): UiKeyboardEvent => {
    const event = new UiKeyboardEvent(UiEventType.KeyDown, name, { ...noKeyModifiers(), ctrl });
    dispatcher.dispatch(event, target);
    return event;
  };
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { graph, dispatcher, key, rebuild };
}

describe('shortcuts', () => {
  it('feeds keys to the registry and marks the ones it took', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    registry.register({ keys: 'Mod+K', label: 'Palette', run });
    const { key } = build(Column({ modifiers: [shortcuts({ registry })] }, Box({})));

    const taken = key('k', true);
    expect(run).toHaveBeenCalledTimes(1);
    // The keyboard controller reads this before applying Tab
    // navigation, Enter on a button, or an editable's own keys.
    expect(taken.defaultPrevented).toBe(true);

    expect(key('j', true).defaultPrevented).toBe(false);
  });

  it('leaves a key an application handler already claimed', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    registry.register({ keys: 'Escape', label: 'Close', run });
    const { graph, key } = build(
      Column({ modifiers: [shortcuts({ registry })] }, Box({ onKeyDown: event => event.preventDefault() }))
    );

    key('Escape', false, graph.root.firstChild!.firstChild!);

    expect(run).not.toHaveBeenCalled();
  });
});

describe('shortcut', () => {
  it('registers for as long as the element exists', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    const withRow = Column(
      { modifiers: [shortcuts({ registry })] },
      Box({ key: 'row', modifiers: [shortcut({ registry, keys: 'Mod+D', label: 'Duplicate', scoped: false, run })] })
    );
    const { key, rebuild } = build(withRow);

    key('d', true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(registry.all).toHaveLength(1);

    // The screen goes away and takes its command with it, which is the
    // one thing a root handler switching on the route cannot do.
    rebuild(Column({ modifiers: [shortcuts({ registry })] }));
    expect(registry.all).toHaveLength(0);
    key('d', true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is live only while focus is inside the element, by default', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    const { graph, key } = build(
      Column(
        { modifiers: [shortcuts({ registry })] },
        Box({ key: 'panel', modifiers: [shortcut({ registry, keys: 'Delete', label: 'Remove', run })] }),
        Box({ key: 'other' })
      )
    );
    const panel = graph.root.firstChild!.firstChild!;
    const other = panel.nextSibling!;

    key('Delete', false, panel);
    expect(run).toHaveBeenCalledTimes(1);

    key('Delete', false, other);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('follows a handler that changes between renders without re-registering', () => {
    const registry = new UiShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const page = (run: () => void): UiChild =>
      Column(
        { modifiers: [shortcuts({ registry })] },
        Box({ key: 'row', modifiers: [shortcut({ registry, keys: 'Mod+S', label: 'Save', scoped: false, run })] })
      );
    const { key, rebuild } = build(page(first));

    rebuild(page(second));
    key('s', true);

    expect(registry.all).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('contextMenu', () => {
  it('reports where the menu was asked for', () => {
    const onOpen = vi.fn();
    const { graph, dispatcher } = build(Column({}, Box({ modifiers: [contextMenu({ onOpen })] })));
    const box = graph.root.firstChild!.firstChild!;

    dispatcher.dispatch(new UiPointerEvent(UiEventType.ContextMenu, 120, 64, 2), box);

    expect(onOpen).toHaveBeenCalledWith({ x: 120, y: 64 });
  });

  it('keeps the request from reaching a menu further out', () => {
    const outer = vi.fn();
    const { graph, dispatcher } = build(
      Column({ modifiers: [contextMenu({ onOpen: outer })] }, Box({ modifiers: [contextMenu({ onOpen: () => {} })] }))
    );
    const box = graph.root.firstChild!.firstChild!;

    dispatcher.dispatch(new UiPointerEvent(UiEventType.ContextMenu, 10, 10, 2), box);

    expect(outer).not.toHaveBeenCalled();
  });
});
