import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import { Box, Text, type UiNode, type UiRole, type UiSemanticsRecord } from '@gesso/core';
import { Accordion, Card, Divider, Tabs, Toolbar } from './Structure';
import { SplitPane } from './SplitPane';

function mount(root: Parameters<typeof renderTest>[0]) {
  const ui = renderTest(root, { width: 400, height: 300 });
  return {
    ...ui,
    focusRole: (role: UiRole): UiNode => {
      const node = ui.getByRole(role);
      ui.fireEvent.focus(node);
      return node;
    },
    recordsFor: (role: UiRole): UiSemanticsRecord[] => ui.getAllByRole(role).map(node => ui.getSemantics(node))
  };
}

describe('Tabs', () => {
  const tabs = [
    { value: 'stories', label: 'Stories' },
    { value: 'props', label: 'Props' },
    { value: 'notes', label: 'Notes', disabled: true }
  ];

  it('is one tab stop whose arrows move the selection', () => {
    const changes: string[] = [];
    const ui = mount(
      createComponent(Tabs, { tabs, defaultValue: 'stories', onChange: (v: string) => changes.push(v) })
    );
    ui.focusRole('tablist');

    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');

    // Notes is disabled, so the second step wraps to Stories.
    expect(changes).toEqual(['props', 'stories']);
  });

  it('marks the selected tab and names its panel', () => {
    const ui = mount(createComponent(Tabs, { tabs, defaultValue: 'props' }));

    expect(ui.recordsFor('tab').map(record => [record.label, record.states])).toEqual([
      ['Stories', undefined],
      ['Props', ['selected']],
      ['Notes', undefined]
    ]);
    expect(ui.recordsFor('tabpanel')[0].label).toBe('Props');
  });
});

describe('Accordion', () => {
  const sections = [
    { value: 'one', label: 'First', content: Text({ text: 'inside one' }) },
    { value: 'two', label: 'Second', content: Text({ text: 'inside two' }) }
  ];

  it('opens and closes a section, and says which it is', () => {
    const ui = mount(createComponent(Accordion, { sections }));
    const header = () => ui.getSemantics(ui.getByRole('button', { name: 'First' }));
    expect(header().states).toEqual(['collapsed']);

    ui.fireEvent.click(ui.getByRole('button', { name: 'First' }));
    ui.frame();

    expect(header().states).toEqual(['expanded']);
    expect(ui.allNodes().some(node => node.properties.get('text') === 'inside one')).toBe(true);
  });

  it('closes the open one when it is exclusive', () => {
    const open: string[][] = [];
    const ui = mount(
      createComponent(Accordion, {
        sections,
        exclusive: true,
        defaultOpen: ['one'],
        onOpenChange: (next: readonly string[]) => open.push([...next])
      })
    );

    ui.fireEvent.click(ui.getByRole('button', { name: 'Second' }));
    ui.frame();

    expect(open).toEqual([['two']]);
  });

  it('keeps a closed section out of the tree entirely', () => {
    const ui = mount(createComponent(Accordion, { sections }));
    expect(ui.allNodes().some(node => node.properties.get('text') === 'inside one')).toBe(false);
  });
});

describe('Card, Divider and Toolbar', () => {
  it('name themselves for a screen reader without being furniture', () => {
    const ui = mount(createComponent(Card, { title: 'Details', children: Text({ text: 'body' }) }));
    expect(ui.recordsFor('group')[0].label).toBe('Details');
  });

  it('a divider is a separator with no name to announce', () => {
    const ui = mount(createComponent(Divider, {}));
    const record = ui.recordsFor('separator')[0];
    expect(record.label).toBeUndefined();
  });

  it('a toolbar groups its controls under one name', () => {
    const ui = mount(createComponent(Toolbar, { label: 'Formatting', children: Text({ text: 'B' }) }));
    expect(ui.recordsFor('toolbar')[0].label).toBe('Formatting');
  });
});

describe('SplitPane', () => {
  it('resizes from the keyboard, within its bounds', () => {
    const changes: number[] = [];
    const ui = mount(
      createComponent(SplitPane, {
        defaultSplit: 0.5,
        min: 0.2,
        max: 0.8,
        first: Box({}),
        second: Box({}),
        onSplitChange: (value: number) => changes.push(value)
      })
    );
    ui.focusRole('separator');

    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('End');
    ui.fireEvent.keyDown('ArrowRight');

    expect(changes[0]).toBeCloseTo(0.52, 5);
    expect(changes[1]).toBeCloseTo(0.8, 5);
    // Already at the maximum.
    expect(changes[2]).toBeCloseTo(0.8, 5);
  });

  it('turns a pan into a fraction of the track it measured', () => {
    const split = new BehaviorSubject(0.5);
    const changes: number[] = [];
    const ui = mount(
      createComponent(SplitPane, {
        split,
        first: Box({}),
        second: Box({}),
        onSplitChange: (value: number) => changes.push(value)
      })
    );
    // The measure modifier reported the track's box on the first frame.
    ui.frame();

    // The container is 400 wide, so a quarter along is 0.25.
    ui.fireEvent.pan(ui.getByRole('separator'), 100, 10);

    expect(changes).toEqual([0.25]);
  });

  it('reports where the divider is, as a percentage', () => {
    const ui = mount(createComponent(SplitPane, { defaultSplit: 0.35, first: Box({}), second: Box({}) }));
    const record = ui.recordsFor('separator')[0];
    expect(record.valueNow).toBe(35);
    expect(record.valueMin).toBe(10);
    expect(record.valueMax).toBe(90);
  });
});
