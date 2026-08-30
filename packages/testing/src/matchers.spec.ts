import { describe, expect, it } from 'vitest';

import { Button, Column, Row, Text } from '@gesso/core';

import './matchers';
import { renderTest } from './renderTest';

/**
 * The matchers, and the one thing they are for.
 *
 * Comparing numbers is not it — `expect(ui.getLayout(node)).toEqual(…)`
 * does that already. What is asserted here is the failure message: a
 * missed `toHaveBox` has to hand back L8's explanation, because that is
 * the whole of F7's exit criterion in a terminal.
 */
describe('toHaveBox', () => {
  it('compares only the fields it was given', () => {
    const ui = renderTest(Row(Button({ text: 'Save', label: 'Save', width: 64, height: 24 })), {
      width: 300,
      height: 100
    });

    expect(ui.getByRole('button')).toHaveBox({ width: 64 });
    expect(ui.getByRole('button')).toHaveBox({ x: 0, y: 0, width: 64, height: 24 });
    expect(ui.getByRole('button')).not.toHaveBox({ width: 65 });
  });

  it('explains why, when it misses', () => {
    const ui = renderTest(
      Row(Text({ text: 'a very long label indeed', label: 'label', flexShrink: 1, textOverflow: 'clip' })),
      { width: 40, height: 100 }
    );

    let message = '';
    try {
      expect(ui.getByLabel('label')).toHaveBox({ width: 400 });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('to have width 400');
    // The explanation, not just the number: which rule fixed the axis.
    expect(message).toContain('Why:');
    expect(message).toContain(ui.explainText(ui.getByLabel('label')).split('\n')[0]);
  });
});

describe('toHaveSemantics', () => {
  it('reads the record an assistive technology would', () => {
    const ui = renderTest(Column(Button({ text: 'Save', label: 'Save', disabled: true })), {
      width: 200,
      height: 100
    });

    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Save', disabled: true });
    expect(ui.getByRole('button')).not.toHaveSemantics({ name: 'Cancel' });
  });

  it('says plainly when a node is not in the tree at all', () => {
    const ui = renderTest(Column(Text({ text: 'plain' })), { width: 200, height: 100 });
    const column = ui.allNodes().find(node => node.type === 'column')!;

    expect(() => expect(column).toHaveSemantics({ role: 'group' })).toThrow(/not — nothing gives it a role or a label/);
  });
});

describe('toHaveText and toHaveFocus', () => {
  it('reads the text a node draws and where focus is', () => {
    const ui = renderTest(Column(Button({ text: 'One', label: 'One' }), Button({ text: 'Two', label: 'Two' })), {
      width: 200,
      height: 100
    });

    expect(ui.getByLabel('One')).toHaveText('One');
    expect(ui.getByLabel('One')).not.toHaveFocus();

    ui.fireEvent.focus(ui.getByLabel('One'));

    expect(ui.getByLabel('One')).toHaveFocus();
    expect(ui.getByLabel('Two')).not.toHaveFocus();
  });
});
