import { describe, expect, it } from 'vitest';

import { Box, Button, Column, Row, ScrollView, Text } from 'gesso-core';

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

describe('toHaveVisibleBox', () => {
  /**
   * The matcher exists because `toHaveBox` cannot make this claim. A
   * sticky header is laid out at the top of its content and stays laid
   * out there however far the container scrolls, so a spec written
   * against the laid-out box passes for a header that scrolled away —
   * which is the one thing a sticky header must not do.
   */
  it('reports where a scrolled node is seen, not where it was laid out', async () => {
    const ui = renderTest(
      ScrollView(
        { width: 100, height: 100, role: 'region', label: 'scroller' },
        Box({ key: 'head', height: 20, width: 100, position: 'sticky', top: 0, role: 'banner' }),
        Box({ key: 'tall', height: 1000, width: 100, role: 'main' })
      )
    );
    await ui.settle();

    const head = ui.getByRole('banner');
    const body = ui.getByRole('main');
    expect(head).toHaveVisibleBox({ y: 0 });
    expect(body).toHaveVisibleBox({ y: 20 });

    ui.fireEvent.wheel({ x: 50, y: 50, deltaY: 300 });
    await ui.settle();

    // Both are laid out exactly where they always were, so `toHaveBox`
    // cannot tell these two apart. Seen, the content has gone up by
    // three hundred and the header has not moved at all, which is the
    // whole of what sticky claims.
    expect(head).toHaveBox({ y: 0 });
    expect(body).toHaveBox({ y: 20 });
    expect(head).toHaveVisibleBox({ y: 0 });
    expect(body).toHaveVisibleBox({ y: -280 });
  });

  it('prints where the node is actually seen when it misses', async () => {
    const ui = renderTest(Box({ width: 10, height: 10, role: 'banner' }));
    await ui.settle();
    expect(() => expect(ui.getByRole('banner')).toHaveVisibleBox({ x: 99 })).toThrow(/seen at/);
  });
});
