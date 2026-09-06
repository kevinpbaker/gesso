import { describe, expect, it, vi } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { noKeyModifiers, type UiKeyModifiers } from './UiInputEvent';
import { InputTestHarness } from './UiInputTestUtils';
import { formatShortcut, parseShortcut, UiShortcutRegistry } from './UiShortcuts';

function mods(over: Partial<UiKeyModifiers> = {}): UiKeyModifiers {
  return { ...noKeyModifiers(), ...over };
}

/** A tree with a panel, a row inside it, and a text field beside them. */
function tree(): { h: InputTestHarness; panel: UiNode; row: UiNode; field: UiNode } {
  const h = new InputTestHarness();
  const panel = h.node('panel', UiNodeType.Column, { width: 200, height: 200 });
  const row = h.node('row', UiNodeType.Row, { width: 200, height: 40 });
  const field = h.node('field', UiNodeType.EditableText, { width: 200, height: 30 });
  h.add(panel, row);
  h.add(h.root, panel, field);
  h.layoutTree();
  return { h, panel, row, field };
}

describe('UiShortcutRegistry', () => {
  it('runs the shortcut whose keys were pressed', () => {
    const registry = new UiShortcutRegistry();
    const save = vi.fn();
    registry.register({ keys: 'Mod+S', label: 'Save', run: save });

    expect(registry.handleKey('s', mods({ ctrl: true }), null)).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reads Mod as either Control or Command', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    registry.register({ keys: 'Mod+K', label: 'Palette', run });

    registry.handleKey('k', mods({ meta: true }), null);
    registry.handleKey('k', mods({ ctrl: true }), null);
    expect(run).toHaveBeenCalledTimes(2);

    // And not the bare key.
    expect(registry.handleKey('k', mods(), null)).toBe(false);
  });

  it('does not run a shortcut whose modifiers were not held', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    registry.register({ keys: 'Mod+Shift+P', label: 'Command', run });

    expect(registry.handleKey('p', mods({ ctrl: true }), null)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(registry.handleKey('p', mods({ ctrl: true, shift: true }), null)).toBe(true);
  });

  it('unregisters when the returned function is called', () => {
    const registry = new UiShortcutRegistry();
    const run = vi.fn();
    const remove = registry.register({ keys: 'Mod+S', label: 'Save', run });

    remove();
    expect(registry.handleKey('s', mods({ ctrl: true }), null)).toBe(false);
    expect(registry.all).toEqual([]);
  });

  describe('scope', () => {
    it('is live only while focus is inside the node it names', () => {
      const { panel, row, field } = tree();
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      registry.register({ keys: 'Delete', label: 'Remove row', scope: panel, run });

      expect(registry.handleKey('Delete', mods(), row)).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);

      // Focus somewhere else in the application: the command is gone.
      expect(registry.handleKey('Delete', mods(), field)).toBe(false);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('gives the deeper scope the key when two want it', () => {
      const { panel, row } = tree();
      const registry = new UiShortcutRegistry();
      const outer = vi.fn();
      const inner = vi.fn();
      registry.register({ keys: 'Enter', label: 'Open panel', scope: panel, run: outer });
      registry.register({ keys: 'Enter', label: 'Open row', scope: row, run: inner });

      registry.handleKey('Enter', mods(), row);

      expect(inner).toHaveBeenCalledTimes(1);
      expect(outer).not.toHaveBeenCalled();
    });

    it('lets an explicit priority beat depth', () => {
      const { panel, row } = tree();
      const registry = new UiShortcutRegistry();
      const outer = vi.fn();
      const inner = vi.fn();
      registry.register({ keys: 'Enter', label: 'Open panel', scope: panel, priority: 1, run: outer });
      registry.register({ keys: 'Enter', label: 'Open row', scope: row, run: inner });

      registry.handleKey('Enter', mods(), row);

      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).not.toHaveBeenCalled();
    });

    it('skips a shortcut whose own condition says no', () => {
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      let available = false;
      registry.register({ keys: 'Mod+Z', label: 'Undo', when: () => available, run });

      expect(registry.handleKey('z', mods({ ctrl: true }), null)).toBe(false);
      available = true;
      expect(registry.handleKey('z', mods({ ctrl: true }), null)).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('typing', () => {
    it('leaves a bare letter alone while a field has focus', () => {
      const { field, row } = tree();
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      registry.register({ keys: 'n', label: 'New note', run });

      expect(registry.handleKey('n', mods(), field)).toBe(false);
      expect(run).not.toHaveBeenCalled();

      // The same key anywhere else is the shortcut.
      expect(registry.handleKey('n', mods(), row)).toBe(true);
    });

    it('still takes a modified key inside a field', () => {
      const { field } = tree();
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      registry.register({ keys: 'Mod+S', label: 'Save', run });

      expect(registry.handleKey('s', mods({ ctrl: true }), field)).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('chords', () => {
    it('runs after the whole sequence arrives', () => {
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      registry.register({ keys: 'g d', label: 'Go to diagnostics', run });

      // The first key is taken, so nothing else acts on it.
      expect(registry.handleKey('g', mods(), null)).toBe(true);
      expect(run).not.toHaveBeenCalled();
      expect(registry.handleKey('d', mods(), null)).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('abandons a chord whose second key is not one of the endings', () => {
      const registry = new UiShortcutRegistry();
      const run = vi.fn();
      registry.register({ keys: 'g d', label: 'Go to diagnostics', run });

      registry.handleKey('g', mods(), null);
      expect(registry.handleKey('x', mods(), null)).toBe(false);
      expect(run).not.toHaveBeenCalled();

      // And the pending press did not survive to poison the next one.
      expect(registry.handleKey('d', mods(), null)).toBe(false);
    });

    it('forgets the first key once the chord has timed out', () => {
      let clock = 0;
      const registry = new UiShortcutRegistry({ chordTimeout: 500, now: () => clock });
      const run = vi.fn();
      registry.register({ keys: 'g d', label: 'Go to diagnostics', run });

      registry.handleKey('g', mods(), null);
      clock = 900;
      expect(registry.handleKey('d', mods(), null)).toBe(false);
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('what a palette lists', () => {
    it('is exactly what would run, in the order it would be tried', () => {
      const { panel, row, field } = tree();
      const registry = new UiShortcutRegistry();
      registry.register({ keys: 'Mod+K', label: 'Palette', run: () => {} });
      registry.register({ keys: 'Delete', label: 'Remove row', scope: panel, run: () => {} });
      registry.register({ keys: 'Mod+P', label: 'Print', when: () => false, run: () => {} });

      expect(registry.active(row).map(binding => binding.label)).toEqual(['Remove row', 'Palette']);
      // Focus in the field: the panel's command is not offered, and
      // neither is the one whose condition is false.
      expect(registry.active(field).map(binding => binding.label)).toEqual(['Palette']);
    });

    it('carries a display string a palette can print', () => {
      const registry = new UiShortcutRegistry();
      registry.register({ keys: 'Mod+Shift+k', label: 'Palette', group: 'View', run: () => {} });

      const [binding] = registry.active(null);
      expect(binding.display).toBe('Ctrl+Shift+K');
      expect(binding.group).toBe('View');
    });
  });

  describe('parsing', () => {
    it('reads modifiers, chords and the plus key itself', () => {
      expect(parseShortcut('Mod+Alt+ArrowUp')).toEqual([
        { key: 'ArrowUp', mod: true, ctrl: false, meta: false, shift: false, alt: true }
      ]);
      expect(parseShortcut('g d').map(step => step.key)).toEqual(['g', 'd']);
      expect(parseShortcut('Mod++')[0].key).toBe('+');
    });

    it('folds a single letter so Mod+K and Mod+k are one shortcut', () => {
      expect(parseShortcut('Mod+K')).toEqual(parseShortcut('Mod+k'));
      expect(formatShortcut(parseShortcut('Mod+k'))).toBe('Ctrl+K');
    });
  });
});
