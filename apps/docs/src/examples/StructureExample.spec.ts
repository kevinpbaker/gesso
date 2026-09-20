import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Card, Divider, Toolbar } from 'gesso-components';
import { Box, Column, Row, Text } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Shipment } from './StructureExample';

const SIZE = { width: 460, height: 320 };

const mount = () => renderTest(createComponent(Shipment, {}), SIZE);

/**
 * The three pages claim: a card is a `group` named by its title, a
 * divider is an unnamed `separator` that is a pixel on its short axis,
 * a toolbar is a `toolbar` named by its label whose buttons stay
 * ordinary tab stops, and none of the three takes focus or binds a
 * key. Each is a test.
 */
describe('the docs structure example', () => {
  it('is a card, a toolbar and two rules, and nothing else announces itself', () => {
    const ui = mount();

    expect(ui.getByRole('group')).toHaveSemantics({ role: 'group', name: 'Shipment 4192' });
    expect(ui.getByRole('toolbar')).toHaveSemantics({ role: 'toolbar', name: 'Shipment actions' });
    expect(ui.getAllByRole('separator')).toHaveLength(2);

    // None of the three is a tab stop: they group, and nothing else.
    expect(ui.fireEvent.focus(ui.getByRole('group'))).toBe(false);
    expect(ui.fireEvent.focus(ui.getByRole('toolbar'))).toBe(false);
  });

  it('names a card by its title, and lets a label say something else', () => {
    // The title is drawn and is also the name, so the heading is
    // written once.
    const titled = renderTest(createComponent(Card, { title: 'Details', children: Text({ text: 'body' }) }), SIZE);
    expect(titled.getSemantics(titled.getByRole('group')).label).toBe('Details');
    expect(titled.getByText('Details')).toBeDefined();

    // A label wins over the title, for a name that reads better than
    // the heading does.
    const labelled = renderTest(
      createComponent(Card, { title: 'Details', label: 'Shipment details', children: Text({ text: 'body' }) }),
      SIZE
    );
    expect(labelled.getSemantics(labelled.getByRole('group')).label).toBe('Shipment details');

    // With neither, the group is still a group, with an empty name.
    const bare = renderTest(createComponent(Card, { children: Text({ text: 'body' }) }), SIZE);
    expect(bare.getSemantics(bare.getByRole('group')).label).toBe('');
    expect(bare.getSemantics(bare.getByRole('group')).role).toBe('group');
  });

  it('does not follow a title that changes into the name', () => {
    const title = new BehaviorSubject('Details');
    const ui = renderTest(createComponent(Card, { title, children: Text({ text: 'body' }) }), SIZE);
    expect(ui.getSemantics(ui.getByRole('group')).label).toBe('Details');

    title.next('Shipment');
    ui.frame();

    // The heading is bound and follows. The name fell back to the
    // title once, when `label` last emitted, and stays where it was.
    expect(ui.getByText('Shipment')).toBeDefined();
    expect(ui.getSemantics(ui.getByRole('group')).label).toBe('Details');
  });

  it('pads a card by 16, and by whatever padding says instead', () => {
    const body = Text({ text: 'body' });
    const byDefault = renderTest(createComponent(Card, { width: 200, children: body }), SIZE);
    byDefault.frame();
    const outer = byDefault.getLayout(byDefault.getByRole('group'));
    const inner = byDefault.getLayout(byDefault.getByText('body'));
    expect(inner.x - outer.x).toBe(16);

    const tight = renderTest(createComponent(Card, { width: 200, padding: 4, children: Text({ text: 'body' }) }), SIZE);
    tight.frame();
    expect(tight.getLayout(tight.getByText('body')).x - tight.getLayout(tight.getByRole('group')).x).toBe(4);
  });

  it('draws a rule with no name, and no way to focus it', () => {
    const ui = mount();
    ui.frame();
    const rules = ui.getAllByRole('separator');

    for (const rule of rules) {
      expect(ui.getSemantics(rule).label).toBeUndefined();
      expect(ui.fireEvent.focus(rule)).toBe(false);
    }

    // The horizontal one is a pixel tall and spans the column; the
    // vertical one is a pixel wide and took its height from the row
    // that stretches it.
    const boxes = rules.map(rule => ui.getLayout(rule));
    const vertical = boxes.find(box => Math.round(box.width) === 1);
    const horizontal = boxes.find(box => Math.round(box.height) === 1);
    expect(vertical?.height).toBeGreaterThan(1);
    expect(horizontal?.width).toBeGreaterThan(1);
  });

  it('sizes a rule itself, whatever the caller asked for', () => {
    // A horizontal rule writes its own height, width and flexGrow
    // after the caller's layout props, so those three do not reach it.
    // Margins are not among them and do.
    const ui = renderTest(
      Row({ width: 300, height: 200 }, createComponent(Divider, { width: 50, height: 9, flexGrow: 0, marginLeft: 8 })),
      SIZE
    );
    ui.frame();
    const box = ui.getLayout(ui.getByRole('separator'));
    expect(box.height).toBe(1);
    expect(box.width).toBe(292);
    expect(box.x).toBe(8);

    // A vertical rule takes its height from the row, so a row that
    // centres its children leaves it none.
    const centred = renderTest(
      Row(
        { width: 300, height: 40, y: 'center' },
        Text({ text: 'A' }),
        createComponent(Divider, { direction: 'column' })
      ),
      SIZE
    );
    centred.frame();
    expect(centred.getLayout(centred.getByRole('separator')).height).toBe(0);
  });

  it('grows a horizontal rule on the main axis, spare space and all', () => {
    // `flexGrow: 1` is what spans a rule across a row. In a column it
    // is the vertical axis that grows, so a column with free height
    // hands that height to the rule.
    const roomy = renderTest(Column({ width: 300, height: 200 }, createComponent(Divider, {})), SIZE);
    roomy.frame();
    expect(roomy.getLayout(roomy.getByRole('separator')).height).toBe(200);

    // A column sized by its content has nothing spare to give it.
    const snug = renderTest(
      Box({ width: 300, height: 200 }, Column({ width: 300, selfY: 'start' }, createComponent(Divider, {}))),
      SIZE
    );
    snug.frame();
    expect(snug.getLayout(snug.getByRole('separator')).height).toBe(1);
  });

  it('reads a rule direction once, when it is built', () => {
    const direction = new BehaviorSubject<'row' | 'column'>('row');
    const ui = renderTest(Row({ width: 300, height: 200 }, createComponent(Divider, { direction })), SIZE);
    ui.frame();
    expect(ui.getLayout(ui.getByRole('separator')).height).toBe(1);

    direction.next('column');
    ui.frame();
    // Still the rule it was built as: `direction` is not rebound.
    expect(ui.getLayout(ui.getByRole('separator')).height).toBe(1);
  });

  it('names a toolbar, and leaves its buttons as ordinary tab stops', () => {
    const ui = mount();
    const toolbar = ui.getByRole('toolbar');

    // The group is named once; the buttons keep their own names.
    expect(ui.getSemantics(toolbar).label).toBe('Shipment actions');
    expect(ui.getAllByRole('button').map(node => ui.getSemantics(node).label)).toEqual(['Print', 'Export', 'Archive']);

    // The toolbar itself is not focusable, and Tab walks the buttons.
    expect(ui.fireEvent.focus(toolbar)).toBe(false);
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Print' }));
    ui.fireEvent.tab();
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getByRole('button', { name: 'Export' }));

    // And it swallows nothing: a press on a button inside it arrives.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Export' }));
    ui.frame();
    expect(ui.getByText('Last action: Export')).toBeDefined();
  });

  it('calls an unnamed toolbar a toolbar', () => {
    const ui = renderTest(createComponent(Toolbar, { children: Text({ text: 'B' }) }), SIZE);
    expect(ui.getSemantics(ui.getByRole('toolbar')).label).toBe('Toolbar');
  });

  it('lets a click through a rule to whatever is under it', () => {
    // A rule is not hit testable, so it cannot swallow a press meant
    // for the surface it is drawn on.
    const presses: string[] = [];
    const ui = renderTest(
      Box(
        { width: 200, height: 100, onPointerDown: () => presses.push('surface') },
        createComponent(Divider, { selfY: 'center' })
      ),
      SIZE
    );
    ui.frame();
    const rule = ui.getLayout(ui.getByRole('separator'));

    ui.fireEvent.pointerDown(rule.x + rule.width / 2, rule.y);
    expect(presses).toEqual(['surface']);
  });
});
