import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { PlainView, plainNodeOf, type PlainAction } from './PlainView';

function mount(tree: unknown) {
  const node = new BehaviorSubject<unknown>(tree);
  const actions: PlainAction[] = [];
  const problems: (readonly string[])[] = [];
  const ui = renderTest(
    createComponent(PlainView, {
      node,
      label: 'TODOs',
      onAction: action => actions.push(action),
      onProblem: list => problems.push(list)
    }),
    { width: 400, height: 300 }
  );
  ui.frame();
  const send = (next: unknown) => {
    node.next(next);
    ui.frame();
  };
  return { ui, actions, problems, send };
}

const view = (...children: unknown[]) => ({ type: 'column', children });

describe('PlainView', () => {
  it('draws a tree of plain data with the library’s controls, and says what is pressed', () => {
    const { ui, actions } = mount(
      view(
        { type: 'heading', text: 'TODOs' },
        { type: 'text', text: '3 in this file' },
        { type: 'button', label: 'Refresh', action: 'refresh' }
      )
    );
    expect(ui.getByRole('region', { name: 'TODOs' })).toBeDefined();
    expect(ui.getByRole('heading', { name: 'TODOs' })).toBeDefined();
    expect(ui.getByText('3 in this file')).toBeDefined();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Refresh' }));
    expect(actions).toEqual([{ action: 'refresh', value: null }]);
  });

  it('writes only what changed when the tree is sent again: a node that stays keeps its node and its focus', () => {
    const tree = (count: number) =>
      view({ type: 'text', text: `${count} in this file` }, { type: 'button', label: 'Refresh', action: 'refresh' });
    const { ui, send } = mount(tree(3));
    const button = ui.getByRole('button', { name: 'Refresh' });
    ui.fireEvent.focus(button);
    send(tree(4));
    expect(ui.getByText('4 in this file')).toBeDefined();
    expect(ui.getByRole('button', { name: 'Refresh' })).toBe(button);
    expect(ui.runtime.input.focus.focusedNode).toBe(button);
  });

  it('matches children by key, so a reordered one keeps its node', () => {
    const tree = (order: string[]) => view(...order.map(id => ({ type: 'button', key: id, label: id, action: id })));
    const { ui, send } = mount(tree(['a', 'b', 'c']));
    const b = ui.getByRole('button', { name: 'b' });
    send(tree(['c', 'b', 'a']));
    expect(ui.getAllByRole('button').map(node => ui.getSemantics(node).label)).toEqual(['c', 'b', 'a']);
    expect(ui.getByRole('button', { name: 'b' })).toBe(b);
  });

  it('draws a node again when its type changes', () => {
    const { ui, send } = mount(view({ type: 'text', text: 'Loading' }));
    send(view({ type: 'button', label: 'Retry', action: 'retry' }));
    expect(ui.queryByText('Loading')).toBeNull();
    expect(ui.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('shows a checkbox changed at once, and the sender’s value when it sends one', () => {
    const { ui, actions, send } = mount(
      view({ type: 'checkbox', label: 'Include FIXMEs', checked: false, action: 'fixmes' })
    );
    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();
    expect(ui.getSemantics(ui.getByRole('checkbox')).states ?? []).toContain('checked');
    expect(actions).toEqual([{ action: 'fixmes', value: true }]);
    // The sender says no: it is the owner.
    send(view({ type: 'checkbox', label: 'Include FIXMEs', checked: true, action: 'fixmes' }));
    send(view({ type: 'checkbox', label: 'Include FIXMEs', checked: false, action: 'fixmes' }));
    expect(ui.getSemantics(ui.getByRole('checkbox')).states ?? []).not.toContain('checked');
  });

  it('keeps what is typed in a text field when the tree comes back with an older value, and a new key sets it', () => {
    const tree = (value: string, key = 'filter') =>
      view({ type: 'textInput', key, label: 'Filter', value, action: 'filter' });
    const { ui, actions, send } = mount(tree(''));
    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('todo');
    ui.frame();
    expect(actions.at(-1)).toEqual({ action: 'filter', value: 'todo' });
    send(tree('to'));
    expect(ui.getSemantics(ui.getByRole('textbox')).valueText).toBe('todo');
    send(tree('fixme', 'filter-2'));
    expect(ui.getSemantics(ui.getByRole('textbox')).valueText).toBe('fixme');
  });

  it('opens a list’s item with Enter, by its id', () => {
    const { ui, actions } = mount(
      view({
        type: 'list',
        label: 'Comments',
        action: 'open',
        items: [
          { id: 'a.ts:3', label: 'TODO: one', detail: 'a.ts' },
          { id: 'b.ts:9', label: 'FIXME: two' }
        ]
      })
    );
    const list = ui.getByRole('list', { name: 'Comments' });
    ui.fireEvent.focus(list);
    ui.fireEvent.press('ArrowDown');
    ui.fireEvent.press('Enter');
    expect(actions.at(-1)?.action).toBe('open');
    expect(['a.ts:3', 'b.ts:9']).toContain(actions.at(-1)?.value);
  });

  it('gives a text field a width of its own, not that of what it holds', () => {
    const { ui } = mount(
      view(
        { type: 'textInput', label: 'Filter', value: 'a', action: 'filter' },
        { type: 'textInput', label: 'Wide', width: 5000, action: 'wide' }
      )
    );
    const [narrow, wide] = ui.getAllByRole('textbox');
    expect(ui.getLayout(narrow).width).toBeGreaterThanOrEqual(200);
    expect(ui.getLayout(wide).width).toBeLessThanOrEqual(800);
  });

  it('leaves out what it cannot draw, says so, and draws the rest', () => {
    const { ui, problems } = mount(
      view(
        { type: 'iframe', src: 'https://example.com' },
        'text',
        { type: 'text', text: 'Still here' },
        { type: 'button', label: 'Nothing' }
      )
    );
    expect(ui.getByText('Still here')).toBeDefined();
    expect(problems).toEqual([
      [
        'the tree > 0: "iframe" is not an element this view has.',
        'the tree > 1: not an element (string).',
        'the tree > 3: a button with no action does nothing.'
      ]
    ]);
  });
});

describe('plainNodeOf', () => {
  it('holds a tree to its limits, never throwing', () => {
    const wide = {
      type: 'column',
      children: Array.from({ length: 10 }, () => ({ type: 'text', text: 'x'.repeat(50) }))
    };
    const { node, problems } = plainNodeOf(wide, { nodes: 4, chars: 5 });
    expect(node).toEqual({ type: 'column', children: [1, 2, 3].map(() => ({ type: 'text', text: 'xxxxx' })) });
    expect(problems).toEqual(['More than 4 nodes: the rest are left out.']);

    let deep: unknown = { type: 'text', text: 'bottom' };
    for (let i = 0; i < 5; i++) deep = { type: 'column', children: [deep] };
    expect(plainNodeOf(deep, { depth: 2 }).problems).toEqual([
      'the tree > 0 > 0: deeper than 2; what is in it is left out.'
    ]);

    expect(plainNodeOf(null).node).toEqual({ type: 'column', children: [] });
    expect(plainNodeOf({ type: 'column', gap: 1000, padding: -4, align: 'sideways' }).node).toEqual({
      type: 'column',
      children: [],
      gap: 64,
      padding: 0
    });
  });
});
