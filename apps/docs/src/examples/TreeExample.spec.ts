import { describe, expect, it } from 'vitest';

import type { UiSemanticsRecord } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Files } from './TreeExample';

const SIZE = { width: 460, height: 320 };

function tree(): Rendered {
  return renderTest(createComponent(Files, {}), SIZE);
}

/** The rows the tree has now, in the order they are drawn. */
function items(ui: Rendered): UiSemanticsRecord[] {
  return ui.getAllByRole('treeitem').map(node => ui.getSemantics(node));
}

function labels(ui: Rendered): (string | undefined)[] {
  return items(ui).map(record => record.label);
}

/** The row the tree reports as chosen, by name. */
function chosen(ui: Rendered): string | undefined {
  return items(ui).find(record => record.states?.includes('selected'))?.label;
}

/**
 * What the page claims: only the open part of the model has rows; a row
 * says how deep it is and where it sits among its siblings; expanding
 * and collapsing change which rows exist, whether they are driven from
 * a press, from a key or from a button; the arrow keys do what the
 * keyboard table says; and a node marked `disabled` is announced as
 * unavailable.
 */
describe('the docs tree example', () => {
  it('renders the open part of the model, and says how deep each row is', () => {
    const ui = tree();

    expect(ui.getByRole('tree')).toHaveSemantics({ role: 'tree', name: 'Project files' });
    expect(labels(ui)).toEqual(['src', 'graph', 'layout', 'index.ts', 'docs', 'vendor']);
    expect(items(ui).map(record => record.level)).toEqual([1, 2, 2, 2, 1, 1]);
    // Among siblings, as ARIA means it, rather than the row number.
    expect(items(ui).map(record => record.posInSet)).toEqual([1, 1, 2, 3, 2, 3]);
    expect(items(ui).map(record => record.setSize)).toEqual([3, 3, 3, 3, 3, 3]);
    // A branch says which way it is; a leaf says nothing about opening.
    expect(items(ui)[0].states).toEqual(['expanded', 'selected']);
    expect(items(ui)[1].states).toEqual(['collapsed']);
    expect(items(ui)[3].states).toBeUndefined();
  });

  it('announces a node marked disabled as unavailable rather than hiding it', () => {
    const ui = tree();

    expect(ui.getByRole('treeitem', { name: 'vendor', disabled: true })).toBeTruthy();
    expect(ui.getAllByRole('treeitem', { disabled: true })).toHaveLength(1);
  });

  it('opens and closes a branch from a press, and reports the new set', () => {
    const ui = tree();

    ui.fireEvent.click(ui.getByRole('treeitem', { name: 'docs' }));
    ui.frame();
    expect(labels(ui)).toEqual(['src', 'graph', 'layout', 'index.ts', 'docs', 'guide.md', 'vendor']);
    expect(chosen(ui)).toBe('docs');
    expect(ui.textOf()).toContain('2 branches open. Chosen: docs');

    ui.fireEvent.click(ui.getByRole('treeitem', { name: 'docs' }));
    ui.frame();
    expect(labels(ui)).toEqual(['src', 'graph', 'layout', 'index.ts', 'docs', 'vendor']);
    expect(ui.textOf()).toContain('1 branches open. Chosen: docs');
  });

  it('expands and collapses everything from a button, because the app owns the set', () => {
    const ui = tree();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Expand all' }));
    ui.frame();
    expect(labels(ui)).toEqual([
      'src',
      'graph',
      'UiNode.ts',
      'UiProperty.ts',
      'layout',
      'LayoutEngine.ts',
      'index.ts',
      'docs',
      'guide.md',
      'vendor'
    ]);
    // Three levels deep, and the row says so.
    expect(items(ui)[2].level).toBe(3);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Collapse all' }));
    ui.frame();
    expect(labels(ui)).toEqual(['src', 'docs', 'vendor']);
    expect(ui.textOf()).toContain('0 branches open. Chosen: src');
  });

  it('keeps a chosen key whose row was collapsed away, and starts again from the top', () => {
    const ui = tree();
    ui.fireEvent.focus(ui.getByRole('tree'));
    ui.frame();
    ui.fireEvent.press('ArrowRight');
    ui.fireEvent.press('ArrowRight');
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    expect(chosen(ui)).toBe('UiNode.ts');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Collapse all' }));
    ui.frame();
    // The key is still the chosen one, and no visible row answers to it.
    expect(ui.textOf()).toContain('0 branches open. Chosen: UiNode.ts');
    expect(chosen(ui)).toBeUndefined();

    // So the next arrow has nowhere to step from and takes the first row.
    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(chosen(ui)).toBe('src');
  });

  it('walks and opens with the keys the keyboard table lists', () => {
    const ui = tree();
    ui.fireEvent.focus(ui.getByRole('tree'));
    ui.frame();

    // src is open already, so Right steps into it rather than opening it.
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    expect(chosen(ui)).toBe('graph');

    // graph is closed, so Right opens it, and Right again steps in.
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    expect(labels(ui)).toContain('UiNode.ts');
    ui.fireEvent.press('ArrowRight');
    ui.frame();
    expect(chosen(ui)).toBe('UiNode.ts');

    // From a leaf, Left steps out to the parent; on an open branch it
    // closes it.
    ui.fireEvent.press('ArrowLeft');
    ui.frame();
    expect(chosen(ui)).toBe('graph');
    ui.fireEvent.press('ArrowLeft');
    ui.frame();
    expect(chosen(ui)).toBe('graph');
    expect(labels(ui)).not.toContain('UiNode.ts');

    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(chosen(ui)).toBe('layout');
    ui.fireEvent.press('ArrowUp');
    ui.frame();
    expect(chosen(ui)).toBe('graph');

    ui.fireEvent.press('End');
    ui.frame();
    expect(chosen(ui)).toBe('vendor');
    // Clamped rather than wrapped.
    ui.fireEvent.press('ArrowDown');
    ui.frame();
    expect(chosen(ui)).toBe('vendor');
    ui.fireEvent.press('Home');
    ui.frame();
    expect(chosen(ui)).toBe('src');

    ui.fireEvent.press('Enter');
    ui.frame();
    expect(ui.textOf()).toContain('Enter opened: src');
  });
});
