import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, Row, Text, UiNodeType } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { renderTest } from './renderTest';

/**
 * The library's own suite.
 *
 * It covers the two things that would otherwise only be tested by
 * whether other suites happen to pass: that a query sees what an
 * assistive technology sees, and that text is measured in proportion to
 * its font size rather than by the canvas double's flat answer.
 */
describe('renderTest', () => {
  it('has built, laid out and described the tree before it returns', () => {
    const ui = renderTest(Column(Button({ text: 'Save', label: 'Save' })), { width: 200, height: 100 });

    expect(ui.frames).toHaveLength(1);
    expect(ui.getByRole('button')).toBe(ui.getByLabel('Save'));
    expect(ui.getLayout(ui.getByRole('button')).width).toBeGreaterThan(0);
  });

  it('measures text in proportion to its font size, which a canvas double does not', () => {
    const ui = renderTest(
      Column({ x: 'start' }, Text({ text: 'Title', fontSize: 32 }), Text({ text: 'Title', fontSize: 8 })),
      { width: 400, height: 200 }
    );

    const [heading, caption] = ui.getAllByText('Title');
    expect(ui.getLayout(heading).width).toBeCloseTo(ui.getLayout(caption).width * 4, 5);
  });

  it('gives the layout explanation for a node as text', () => {
    const ui = renderTest(Row(Box({ width: 40, height: 10, label: 'swatch' })), { width: 300, height: 100 });
    const box = ui.getByLabel('swatch');

    expect(ui.explain(box).width.decidedBy).toBe('explicit');
    expect(ui.explainText(box)).toContain('width');
  });

  it('drives frames until an asynchronous change lands', async () => {
    const text$ = new BehaviorSubject('Loading');
    const ui = renderTest(Column(Text({ text: text$ })), { width: 200, height: 100 });

    expect(ui.queryByText('Ready')).toBeNull();
    void Promise.resolve().then(() => text$.next('Ready'));

    expect(await ui.findByText('Ready')).toBeDefined();
  });

  it('unmounts without leaving a frame armed', () => {
    const ui = renderTest(Column(Text({ text: 'Bye' })), { width: 100, height: 100 });

    ui.unmount();

    expect(() => ui.frame()).not.toThrow();
  });
});

describe('queries', () => {
  const app = () =>
    Column(
      Button({ text: 'Save', label: 'Save' }),
      Button({ text: 'Cancel', label: 'Cancel', disabled: true }),
      Text({ text: 'A note about saving' })
    );

  it('separates the accessible name from the text that is drawn', () => {
    const ui = renderTest(Button({ label: 'Save' }, Text({ text: 'Save' })), { width: 400, height: 200 });

    // The Text inside a Button is claimed as the button's name, so it
    // is not a record of its own. byLabel therefore finds the button
    // and byText finds the node that actually draws — two different
    // nodes for one word on the screen.
    expect(ui.getByLabel('Save').type).toBe(UiNodeType.Button);
    expect(ui.getByText('Save').type).toBe(UiNodeType.Text);
    expect(ui.querySemantics(ui.getByText('Save'))).toBeNull();
  });

  it('filters a role by name and by disabled', () => {
    const ui = renderTest(app(), { width: 400, height: 200 });

    expect(ui.getAllByRole('button')).toHaveLength(2);
    expect(ui.getByRole('button', { disabled: true })).toBe(ui.getByLabel('Cancel'));
    expect(ui.getByRole('button', { name: 'Save' })).toBe(ui.getByLabel('Save'));
  });

  it('matches a name by regular expression, with whitespace collapsed', () => {
    const ui = renderTest(Column(Text({ text: '  a   note  ' })), { width: 400, height: 200 });

    expect(ui.getByText(/^a note$/)).toBeDefined();
    expect(ui.getByText('a note')).toBeDefined();
  });

  it('prints the semantics tree and the node tree when nothing matches', () => {
    const ui = renderTest(app(), { width: 400, height: 200 });

    expect(() => ui.getByRole('switch')).toThrow(/Nothing matches role "switch"/);
    expect(() => ui.getByRole('switch')).toThrow(/The semantics tree has:[\s\S]*button · "Save"/);
    expect(() => ui.getByRole('switch')).toThrow(/The node tree is:[\s\S]*role=button/);
  });

  it('refuses to guess when more than one node matches', () => {
    const ui = renderTest(app(), { width: 400, height: 200 });

    expect(() => ui.getByRole('button')).toThrow(/2 nodes match role "button"/);
    expect(() => ui.queryByRole('button')).toThrow(/2 nodes match/);
    expect(ui.getAllByRole('button')).toHaveLength(2);
  });
});

describe('fireEvent', () => {
  function Counter(props: Inputs<{ onPress: () => void }>, _context: ComponentContext) {
    return Button({ text: 'Press', label: 'Press', onClick: () => props.onPress.value() });
  }

  it('reaches a component handler through the dispatcher', () => {
    let presses = 0;
    const ui = renderTest(createComponent(Counter, { onPress: () => presses++ }), {
      width: 200,
      height: 100
    });

    ui.fireEvent.click(ui.getByRole('button'));

    expect(presses).toBe(1);
  });

  it('moves focus with Tab the way the keyboard does', () => {
    const ui = renderTest(Column(Button({ text: 'One', label: 'One' }), Button({ text: 'Two', label: 'Two' })), {
      width: 200,
      height: 100
    });

    ui.fireEvent.focus(ui.getByLabel('One'));
    ui.fireEvent.tab();

    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByLabel('Two'));
  });
});
