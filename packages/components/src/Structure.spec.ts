import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import {
  Box,
  Column,
  Text,
  UiNodeType,
  defineModifier,
  type UiNode,
  type UiRole,
  type UiSemanticsRecord
} from 'gesso-core';
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

  it('follows a real pointer press and drag, not just a synthesized pan', () => {
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
    ui.frame();

    // `fireEvent.pan` dispatches PanMove straight at the node, which
    // tests the handler and not the machinery that has to deliver it.
    // This goes through the pointer controller and the hit tester, so
    // it only passes when the runtime actually feeds a gesture
    // recognizer — which it did not, leaving every `onPan*` and
    // `onDrag*` handler in every app dead while both halves' own specs
    // stayed green.
    ui.fireEvent.pointerDown(202, 150);
    ui.fireEvent.pointerMove(300, 150, { buttons: 1 });
    ui.fireEvent.pointerUp(300, 150);

    // The track is the full 400, so the pointer at 300 is 0.75 along.
    expect(changes.at(-1)).toBeCloseTo(0.75, 5);
  });

  it('puts the divider at the fraction even when a pane holds wider content', () => {
    const split = new BehaviorSubject(0.4);
    const ui = mount(
      Box(
        { width: 200, height: 90, overflow: 'hidden' },
        createComponent(SplitPane, {
          split,
          first: Box({ padding: 8 }, Text({ text: 'stories list', fontSize: 12 })),
          second: Box({ padding: 8 }, Text({ text: 'Drag the divider · 40%', fontSize: 12 }))
        })
      )
    );
    ui.frame();
    const dividerX = (): number => ui.getLayout(ui.getByRole('separator'))!.x;

    // A flex item's automatic minimum is its min-content size, so
    // before both panes opted out of it the second pane's text refused
    // to shrink and pinned the divider partway across — 0.4 and 0.8
    // landed in the same place while `valueNow` happily reported the
    // number it had been given.
    expect(dividerX()).toBeCloseTo(80, 5);
    split.next(0.8);
    ui.frame();
    expect(dividerX()).toBeCloseTo(160, 5);
  });

  it('still moves when it is inside a tab panel', () => {
    const split = new BehaviorSubject(0.4);
    const ui = mount(
      createComponent(Tabs, {
        tabs: [{ value: 'stories', label: 'Stories' }],
        defaultValue: 'stories',
        children: Box(
          { height: 90, overflow: 'hidden' },
          createComponent(SplitPane, {
            split,
            first: Box({ padding: 8 }, Text({ text: 'stories list', fontSize: 12 })),
            second: Box({ padding: 8 }, Text({ text: 'Drag the divider · 40%', fontSize: 12 }))
          })
        )
      })
    );
    ui.frame();
    const dividerX = (): number => ui.getLayout(ui.getByRole('separator'))!.x;

    // A Box is a Stack, so its children are aligned rather than
    // stretched. While the tab panel did not stretch its content, the
    // pane had no definite width for the split to be a fraction of:
    // `valueNow` moved and the divider did not budge, which is exactly
    // what a split pane looks like when it is broken.
    const at40 = dividerX();
    split.next(0.8);
    ui.frame();
    expect(dividerX()).toBeGreaterThan(at40);
  });

  it('reports where the divider is, as a percentage', () => {
    const ui = mount(createComponent(SplitPane, { defaultSplit: 0.35, first: Box({}), second: Box({}) }));
    const record = ui.recordsFor('separator')[0];
    expect(record.valueNow).toBe(35);
    expect(record.valueMin).toBe(10);
    expect(record.valueMax).toBe(90);
  });
});

/**
 * A modifier that does nothing but say where it landed, as
 * `Media.spec` uses: `rootModifiers` is a promise about *which
 * element* a caller's modifier reaches, so the assertion has to be
 * about the node rather than about a property.
 */
const attachedTo: UiNode[] = [];
const mark = defineModifier<void>({
  name: 'mark',
  attach(host) {
    attachedTo.push(host.node);
  }
});

function firstElement(node: UiNode): UiNode {
  let child = node.firstChild;
  while (child !== null && child.type === UiNodeType.Fragment) {
    child = child.firstChild;
  }
  if (child === null) {
    throw new Error(`No element under '${node.id}'.`);
  }
  return child;
}

describe('rootModifiers', () => {
  // Every one of these dropped a caller's `rootModifiers` on the floor
  // until this test existed: they spread `layoutOf(inputs)`, which
  // deliberately excludes the prop, and never called `modifiersOf`.
  // Silent, and the prop's own docblock names this as the failure that
  // does not announce itself: a `sharedElement` on a Card went on
  // claiming nothing and the morph simply did not happen.
  it('reach the element each of these components draws', () => {
    attachedTo.length = 0;
    const hosts: Record<string, UiNode | null> = { card: null, divider: null, toolbar: null, accordion: null };
    const mounted = renderTest(
      Column(
        {},
        Column(
          { ref: (n: UiNode | null) => (hosts.card = n) },
          createComponent(Card, { rootModifiers: [mark(undefined)] })
        ),
        Column(
          { ref: (n: UiNode | null) => (hosts.divider = n) },
          createComponent(Divider, { rootModifiers: [mark(undefined)] })
        ),
        Column(
          { ref: (n: UiNode | null) => (hosts.toolbar = n) },
          createComponent(Toolbar, { rootModifiers: [mark(undefined)] })
        ),
        Column(
          { ref: (n: UiNode | null) => (hosts.accordion = n) },
          createComponent(Accordion, { sections: [], rootModifiers: [mark(undefined)] })
        )
      )
    );
    mounted.frame();

    for (const [name, host] of Object.entries(hosts)) {
      expect(attachedTo, name).toContain(firstElement(host!));
    }
  });
});
