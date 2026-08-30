import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, type GessoRuntime } from '@gesso/framework';
import { mountRuntime } from '@gesso/framework/testing';
import { Box, Text, type UiNode, UiEventType, UiPointerEvent } from '@gesso/core';
import { Accordion, Card, Divider, Tabs, Toolbar } from './Structure';
import { SplitPane } from './SplitPane';

function nodes(runtime: GessoRuntime): UiNode[] {
  const result: UiNode[] = [];
  const visit = (node: UiNode): void => {
    result.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(runtime.layoutRoot());
  return result;
}

function byRole(runtime: GessoRuntime, role: string): UiNode {
  const node = nodes(runtime).find(candidate => candidate.properties.get('role') === role);
  if (node === undefined) {
    throw new Error(`no node with role '${role}'`);
  }
  return node;
}

function records(runtime: GessoRuntime, role: string) {
  return [...runtime.semanticsTree().values()].filter(record => record.role === role);
}

function mount(root: Parameters<typeof mountRuntime>[0]) {
  const mounted = mountRuntime(root, { width: 400, height: 300 });
  mounted.frame(0);
  const { runtime } = mounted;
  return {
    ...mounted,
    press: (key: string) => runtime.input.keyboard.keyDown(key),
    click: (node: UiNode) => runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.Click, 0, 0), node),
    // A press-and-move is a Pan; a Drag in this input model is a long
    // press followed by a move, which is not how a divider is grabbed.
    pan: (node: UiNode, x: number, y: number) =>
      runtime.input.dispatcher.dispatch(new UiPointerEvent(UiEventType.PanMove, x, y), node)
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
    const { runtime, press } = mount(
      createComponent(Tabs, { tabs, defaultValue: 'stories', onChange: (v: string) => changes.push(v) })
    );
    runtime.input.focus.focus(byRole(runtime, 'tablist'));

    press('ArrowRight');
    press('ArrowRight');

    // Notes is disabled, so the second step wraps to Stories.
    expect(changes).toEqual(['props', 'stories']);
  });

  it('marks the selected tab and names its panel', () => {
    const { runtime } = mount(createComponent(Tabs, { tabs, defaultValue: 'props' }));

    expect(records(runtime, 'tab').map(record => [record.label, record.states])).toEqual([
      ['Stories', undefined],
      ['Props', ['selected']],
      ['Notes', undefined]
    ]);
    expect(records(runtime, 'tabpanel')[0].label).toBe('Props');
  });
});

describe('Accordion', () => {
  const sections = [
    { value: 'one', label: 'First', content: Text({ text: 'inside one' }) },
    { value: 'two', label: 'Second', content: Text({ text: 'inside two' }) }
  ];

  it('opens and closes a section, and says which it is', () => {
    const { runtime, click, frame } = mount(createComponent(Accordion, { sections }));
    const header = () => records(runtime, 'button')[0];
    expect(header().states).toEqual(['collapsed']);

    click(byRole(runtime, 'button'));
    frame();

    expect(header().states).toEqual(['expanded']);
    expect(nodes(runtime).some(node => node.properties.get('text') === 'inside one')).toBe(true);
  });

  it('closes the open one when it is exclusive', () => {
    const open: string[][] = [];
    const { runtime, click, frame } = mount(
      createComponent(Accordion, {
        sections,
        exclusive: true,
        defaultOpen: ['one'],
        onOpenChange: (next: readonly string[]) => open.push([...next])
      })
    );

    const headers = nodes(runtime).filter(node => node.properties.get('role') === 'button');
    click(headers[1]);
    frame();

    expect(open).toEqual([['two']]);
  });

  it('keeps a closed section out of the tree entirely', () => {
    const { runtime } = mount(createComponent(Accordion, { sections }));
    expect(nodes(runtime).some(node => node.properties.get('text') === 'inside one')).toBe(false);
  });
});

describe('Card, Divider and Toolbar', () => {
  it('name themselves for a screen reader without being furniture', () => {
    const { runtime } = mount(createComponent(Card, { title: 'Details', children: Text({ text: 'body' }) }));
    expect(records(runtime, 'group')[0].label).toBe('Details');
  });

  it('a divider is a separator with no name to announce', () => {
    const { runtime } = mount(createComponent(Divider, {}));
    const record = records(runtime, 'separator')[0];
    expect(record.label).toBeUndefined();
  });

  it('a toolbar groups its controls under one name', () => {
    const { runtime } = mount(createComponent(Toolbar, { label: 'Formatting', children: Text({ text: 'B' }) }));
    expect(records(runtime, 'toolbar')[0].label).toBe('Formatting');
  });
});

describe('SplitPane', () => {
  it('resizes from the keyboard, within its bounds', () => {
    const changes: number[] = [];
    const { runtime, press } = mount(
      createComponent(SplitPane, {
        defaultSplit: 0.5,
        min: 0.2,
        max: 0.8,
        first: Box({}),
        second: Box({}),
        onSplitChange: (value: number) => changes.push(value)
      })
    );
    runtime.input.focus.focus(byRole(runtime, 'separator'));

    press('ArrowRight');
    press('End');
    press('ArrowRight');

    expect(changes[0]).toBeCloseTo(0.52, 5);
    expect(changes[1]).toBeCloseTo(0.8, 5);
    // Already at the maximum.
    expect(changes[2]).toBeCloseTo(0.8, 5);
  });

  it('turns a pan into a fraction of the track it measured', () => {
    const split = new BehaviorSubject(0.5);
    const changes: number[] = [];
    const { runtime, frame, pan } = mount(
      createComponent(SplitPane, {
        split,
        first: Box({}),
        second: Box({}),
        onSplitChange: (value: number) => changes.push(value)
      })
    );
    // The measure modifier reported the track's box on the first frame.
    frame();

    // The container is 400 wide, so a quarter along is 0.25.
    pan(byRole(runtime, 'separator'), 100, 10);

    expect(changes).toEqual([0.25]);
  });

  it('reports where the divider is, as a percentage', () => {
    const { runtime } = mount(createComponent(SplitPane, { defaultSplit: 0.35, first: Box({}), second: Box({}) }));
    const record = records(runtime, 'separator')[0];
    expect(record.valueNow).toBe(35);
    expect(record.valueMin).toBe(10);
    expect(record.valueMax).toBe(90);
  });
});
