import { describe, expect, it } from 'vitest';

import { noKeyModifiers, UiGraph, UiNodeType, UiShortcutRegistry, type UiKeyModifiers, type UiNode } from 'gesso-core';

import { registerUndoShortcuts } from './undoShortcuts';
import { UndoStack } from './UndoStack';

function mods(over: Partial<UiKeyModifiers> = {}): UiKeyModifiers {
  return { ...noKeyModifiers(), ...over };
}

/** A row, and a text field inside a panel, so focus can be put in either. */
function tree(): { row: UiNode; field: UiNode; inner: UiNode } {
  const graph = new UiGraph();
  const row = graph.createNode('row', UiNodeType.Row);
  const field = graph.createNode('field', UiNodeType.EditableText);
  const inner = graph.createNode('inner', UiNodeType.Text);
  graph.appendChild(graph.root, row);
  graph.appendChild(graph.root, field);
  graph.appendChild(field, inner);
  return { row, field, inner };
}

function stackWithOneChange(): { stack: UndoStack; done: string[] } {
  const stack = new UndoStack();
  const done: string[] = [];
  stack.push({ label: 'Move', undo: () => done.push('undo'), redo: () => done.push('redo') });
  return { stack, done };
}

describe('registerUndoShortcuts', () => {
  it('runs undo on Mod+Z and redo on Mod+Shift+Z', () => {
    const registry = new UiShortcutRegistry();
    const { stack, done } = stackWithOneChange();
    registerUndoShortcuts({ registry, stack });

    expect(registry.handleKey('z', mods({ ctrl: true }), null)).toBe(true);
    expect(done).toEqual(['undo']);
    expect(registry.handleKey('z', mods({ ctrl: true, shift: true }), null)).toBe(true);
    expect(done).toEqual(['undo', 'redo']);
  });

  it('answers Mod+Y as a redo too', () => {
    const registry = new UiShortcutRegistry();
    const { stack, done } = stackWithOneChange();
    registerUndoShortcuts({ registry, stack });
    stack.undo();

    expect(registry.handleKey('y', mods({ ctrl: true }), null)).toBe(true);
    expect(done).toEqual(['undo', 'redo']);
  });

  it('leaves the key alone with nothing to undo', () => {
    const registry = new UiShortcutRegistry();
    const stack = new UndoStack();
    registerUndoShortcuts({ registry, stack });

    // Not taken, so the keyboard controller's own defaults still get
    // it, and a palette listing what is live does not offer it.
    expect(registry.handleKey('z', mods({ ctrl: true }), null)).toBe(false);
    expect(registry.active(null).map(binding => binding.label)).toEqual([]);
  });

  it('leaves Mod+Z to a focused text field', () => {
    const registry = new UiShortcutRegistry();
    const { stack, done } = stackWithOneChange();
    const { row, field, inner } = tree();
    let focused: UiNode | null = field;
    registerUndoShortcuts({ registry, stack, focused: () => focused });

    expect(registry.handleKey('z', mods({ ctrl: true }), field)).toBe(false);
    // And from a node inside the field, which is where the caret
    // actually is.
    focused = inner;
    expect(registry.handleKey('z', mods({ ctrl: true }), inner)).toBe(false);
    expect(done).toEqual([]);

    focused = row;
    expect(registry.handleKey('z', mods({ ctrl: true }), row)).toBe(true);
    expect(done).toEqual(['undo']);
  });

  it('lists both commands for a palette, under a group', () => {
    const registry = new UiShortcutRegistry();
    const { stack } = stackWithOneChange();
    stack.undo();
    stack.push({ label: 'Move', undo: () => undefined, redo: () => undefined });
    registerUndoShortcuts({ registry, stack, group: 'Edit' });

    const live = registry.active(null);
    expect(live.map(binding => binding.label)).toEqual(['Undo']);
    expect(live[0]?.group).toBe('Edit');
    expect(live[0]?.display).toBe('Ctrl+Z');
  });

  it('unregisters both when the returned function is called', () => {
    const registry = new UiShortcutRegistry();
    const { stack } = stackWithOneChange();
    const remove = registerUndoShortcuts({ registry, stack });

    remove();

    expect(registry.all).toEqual([]);
  });
});
