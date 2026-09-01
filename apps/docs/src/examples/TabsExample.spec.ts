import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Tabs, type TabDefinition } from '@gesso/components';
import { Text } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Views } from './TabsExample';

const SIZE = { width: 460, height: 340 };

const mount = () => renderTest(createComponent(Views, {}), SIZE);

/** What the panel is named, which is the label of the tab that is showing. */
function panelName(ui: Rendered, index: number): string {
  return ui.getSemantics(ui.getAllByRole('tabpanel')[index]).label ?? '';
}

/** The tabs that report themselves as chosen, across both strips. */
function selected(ui: Rendered): string[] {
  return ui.getAllByRole('tab', { states: ['selected'] }).map(node => ui.getSemantics(node).label ?? '');
}

/**
 * The page claims the strip is one tab stop whose arrows move the
 * selection and wrap, that Home and End go to the ends, that a
 * disabled tab is stepped over and refuses a click, that a controlled
 * strip moves only when the application writes the value back, and
 * that the strip and its panel announce themselves. Each is a test.
 */
describe('the docs tabs example', () => {
  it('announces a tab list, its tabs and the panel under it', () => {
    const ui = mount();

    expect(ui.getByRole('tablist', { name: 'Views' })).toHaveSemantics({ role: 'tablist', name: 'Views' });
    expect(ui.getByRole('tablist', { name: 'Density' })).toHaveSemantics({ role: 'tablist', name: 'Density' });

    expect(ui.getAllByRole('tab').map(node => ui.getSemantics(node).label)).toEqual([
      'Summary',
      'Activity',
      'Billing',
      'Audit',
      'Comfortable',
      'Compact'
    ]);

    // Exactly one tab in each strip carries `selected`, and the panel
    // takes its name from it.
    expect(selected(ui)).toEqual(['Summary', 'Comfortable']);
    expect(panelName(ui, 0)).toBe('Summary');
    expect(panelName(ui, 1)).toBe('Comfortable');

    // The disabled tab is on the record as disabled rather than missing.
    expect(ui.getSemantics(ui.getByRole('tab', { name: 'Audit' })).disabled).toBe(true);
  });

  it('moves the selection with the arrows, wrapping over the disabled tab', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('tablist', { name: 'Density' }));
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(selected(ui)).toEqual(['Summary', 'Compact']);
    expect(panelName(ui, 1)).toBe('Compact');

    // Two tabs, so the next step wraps back to the first.
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(selected(ui)).toEqual(['Summary', 'Comfortable']);

    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(selected(ui)).toEqual(['Summary', 'Compact']);
  });

  it('answers Home and End with the first and last tab that can be chosen', () => {
    const ui = mount();

    ui.fireEvent.focus(ui.getByRole('tablist', { name: 'Views' }));
    ui.fireEvent.keyDown('ArrowRight');
    ui.frame();
    expect(selected(ui)).toEqual(['Activity', 'Comfortable']);
    expect(panelName(ui, 0)).toBe('Activity');

    // Audit is last and disabled, so End asks for Billing. The
    // application refuses it, and a controlled strip shows only what
    // was written back.
    ui.fireEvent.keyDown('End');
    ui.frame();
    expect(selected(ui)).toEqual(['Activity', 'Comfortable']);
    expect(ui.getByText('Billing needs an administrator')).toBeDefined();

    ui.fireEvent.keyDown('Home');
    ui.frame();
    expect(selected(ui)).toEqual(['Summary', 'Comfortable']);
    expect(panelName(ui, 0)).toBe('Summary');
  });

  it('refuses a click on a disabled tab', () => {
    const ui = mount();

    ui.fireEvent.click(ui.getByRole('tab', { name: 'Audit' }));
    ui.frame();

    expect(selected(ui)).toEqual(['Summary', 'Comfortable']);
    expect(panelName(ui, 0)).toBe('Summary');
  });

  it('renders the panel the caller wrote, and swaps it with the selection', () => {
    const ui = mount();

    expect(ui.getByText('Two shipments in transit, one waiting for collection.')).toBeDefined();

    ui.fireEvent.click(ui.getByRole('tab', { name: 'Activity' }));
    ui.frame();

    expect(ui.getByText('The delivery address was changed 20 minutes ago.')).toBeDefined();
    expect(ui.queryByText('Two shipments in transit, one waiting for collection.')).toBeNull();
  });

  it('does not move a controlled strip the application never writes back', () => {
    const tabs: readonly TabDefinition[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' }
    ];
    const view = new BehaviorSubject('one');
    const ui = renderTest(createComponent(Tabs, { tabs, value: view, children: Text({ text: 'panel' }) }), SIZE);
    const list = ui.getByRole('tablist');

    // No `onChange` at all: every request is dropped on the floor.
    ui.fireEvent.focus(list);
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('End');
    ui.fireEvent.click(ui.getByRole('tab', { name: 'Two' }));
    ui.frame();
    expect(ui.getAllByRole('tab', { states: ['selected'] }).map(node => ui.getSemantics(node).label)).toEqual(['One']);

    // The application writing the value is the only thing that moves it.
    view.next('two');
    ui.frame();
    expect(ui.getAllByRole('tab', { states: ['selected'] }).map(node => ui.getSemantics(node).label)).toEqual(['Two']);
    expect(ui.getSemantics(ui.getByRole('tabpanel')).label).toBe('Two');
  });

  it('lets an uncontrolled strip manage itself', () => {
    const tabs: readonly TabDefinition[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' }
    ];
    const seen: string[] = [];
    const ui = renderTest(
      createComponent(Tabs, {
        tabs,
        defaultValue: 'one',
        onChange: (next: string) => seen.push(next),
        children: Text({ text: 'panel' })
      }),
      SIZE
    );

    ui.fireEvent.click(ui.getByRole('tab', { name: 'Two' }));
    ui.frame();

    // Nothing wrote the value back, and it moved anyway.
    expect(seen).toEqual(['two']);
    expect(ui.getAllByRole('tab', { states: ['selected'] }).map(node => ui.getSemantics(node).label)).toEqual(['Two']);
  });

  it('starts with nothing selected when it is given no value at all', () => {
    const tabs: readonly TabDefinition[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' }
    ];
    const ui = renderTest(createComponent(Tabs, { tabs, children: Text({ text: 'panel' }) }), SIZE);

    expect(ui.getAllByRole('tab').filter(node => ui.getSemantics(node).states !== undefined)).toEqual([]);
    expect(ui.getSemantics(ui.getByRole('tabpanel')).label).toBe('');

    // With a value that matches no tab, either arrow lands on the
    // first tab that can be chosen rather than stepping from nowhere.
    ui.fireEvent.focus(ui.getByRole('tablist'));
    ui.fireEvent.keyDown('ArrowLeft');
    ui.frame();
    expect(ui.getAllByRole('tab', { states: ['selected'] }).map(node => ui.getSemantics(node).label)).toEqual(['One']);
  });

  it('says which tab is chosen with a state, and not with a number', () => {
    const ui = mount();
    const record = ui.getSemantics(ui.getByRole('tab', { name: 'Summary' }));

    expect(record.states).toEqual(['selected']);
    expect(record.valueNow).toBeUndefined();
    // A tab does not carry its position in the strip, so nothing
    // announces "2 of 4".
    expect(record.posInSet).toBeUndefined();
    expect(record.setSize).toBeUndefined();

    // A tab's own text is claimed as its name rather than announced
    // twice, so the text inside a tab has no record of its own.
    expect(ui.querySemantics(ui.getByText('Summary'))).toBeNull();
  });

  it('throws when it is handed both value and defaultValue', () => {
    const tabs: readonly TabDefinition[] = [{ value: 'one', label: 'One' }];
    expect(() =>
      renderTest(createComponent(Tabs, { tabs, value: 'one', defaultValue: 'one', children: Text({ text: '' }) }), SIZE)
    ).toThrow(/Tabs/);
  });
});
