import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button } from '../composition/UiComponents';
import { UiGraphBuilder } from '../composition/UiGraphBuilder';
import type { UiChild } from '../composition/UiElement';
import { DirtyFlags } from '../graph/DirtyFlags';
import { UiGraph } from '../graph/UiGraph';
import type { UiNode } from '../graph/UiNode';
import { resetOverrideWarnings } from '../graph/UiPropertyOverrides';
import { UiInputDispatcher } from '../input/UiInputDispatcher';
import { UiEventType, UiPointerEvent } from '../input/UiInputEvent';
import { UiVisualState } from '../properties/UiVisualState';
import { defineModifier } from './UiModifier';
import { hoverable, interactive, pressable } from './interaction';

function build(root: UiChild) {
  const graph = new UiGraph();
  const dispatcher = new UiInputDispatcher();
  const builder = new UiGraphBuilder(graph, { dispatcher });
  builder.reconcileChildren(graph.root, [root]);
  const node = graph.root.firstChild!;
  const send = (type: UiEventType): void => {
    dispatcher.dispatch(new UiPointerEvent(type, 0, 0), node);
  };
  const rebuild = (next: UiChild): void => {
    builder.reconcileChildren(graph.root, [next]);
  };
  return { graph, builder, node, send, rebuild };
}

/** A modifier that writes whatever it is given, for the cascade tests. */
const writer = defineModifier<{ property: string; value: unknown }>({
  name: 'writer',
  attach(host, args) {
    host.set(args.property, args.value);
  },
  update(host, args) {
    host.set(args.property, args.value);
  }
});

const states = (node: UiNode): string[] => [...((node.properties.get('visualState') as Set<string>) ?? [])].sort();

describe('modifier property overrides', () => {
  beforeEach(() => {
    resetOverrideWarnings();
  });

  it('writes over the element value and restores it on detach', () => {
    const { graph, node, rebuild } = build(Box({ width: 200, modifiers: [writer({ property: 'width', value: 240 })] }));
    expect(node.properties.get('width')).toBe(240);
    graph.getDirtyNodes().take();

    rebuild(Box({ width: 200 }));

    expect(node.properties.get('width')).toBe(200);
    expect(node.dirtyFlags & DirtyFlags.Layout).not.toBe(0);
    // Nothing is overriding anything, so the fast path is back.
    expect(node.overrides).toBeNull();
  });

  it('restores absence, not a default, so inheritance comes back', () => {
    const { node, rebuild } = build(Box({ modifiers: [writer({ property: 'fontSize', value: 20 })] }));
    expect(node.properties.get('fontSize')).toBe(20);

    rebuild(Box({}));

    expect(node.properties.has('fontSize')).toBe(false);
  });

  it('keeps the element value up to date underneath the override', () => {
    const width$ = new BehaviorSubject(200);
    const { node, rebuild } = build(Box({ width: width$, modifiers: [writer({ property: 'width', value: 240 })] }));

    width$.next(300);
    expect(node.properties.get('width')).toBe(240);

    rebuild(Box({ width: width$ }));

    // The emission that arrived while the override was on is what the
    // element gets back, not the value it had when the override began.
    expect(node.properties.get('width')).toBe(300);
  });

  it('lets the later modifier in the list win, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { node } = build(
      Box({
        width: 10,
        modifiers: [writer({ property: 'width', value: 20 }), writer({ property: 'width', value: 30 })]
      })
    );

    expect(node.properties.get('width')).toBe(30);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("both write 'width'");
    warn.mockRestore();
  });

  it('falls back to the one underneath when the winner detaches', () => {
    const under = writer({ property: 'width', value: 20 }, 'under');
    const over = writer({ property: 'width', value: 30 }, 'over');
    const { node, rebuild } = build(Box({ width: 10, modifiers: [under, over] }));
    expect(node.properties.get('width')).toBe(30);

    rebuild(Box({ width: 10, modifiers: [under] }));

    expect(node.properties.get('width')).toBe(20);
  });

  it('follows an Observable given to set, and drops it on detach', () => {
    const value$ = new BehaviorSubject(20);
    const observed = defineModifier<void>({
      name: 'observed',
      attach(host) {
        host.set('width', value$);
      }
    });
    const { node, rebuild } = build(Box({ width: 10, modifiers: [observed(undefined)] }));
    expect(node.properties.get('width')).toBe(20);

    value$.next(30);
    expect(node.properties.get('width')).toBe(30);

    rebuild(Box({ width: 10 }));
    expect(node.properties.get('width')).toBe(10);
    value$.next(40);
    expect(node.properties.get('width')).toBe(10);
  });

  it('rejects reading or writing a property nothing knows about', () => {
    const bad = defineModifier<void>({
      name: 'bad',
      attach(host) {
        host.set('widht', 1);
      }
    });
    expect(() => build(Box({ modifiers: [bad(undefined)] }))).toThrow(/unknown property 'widht'/);
  });
});

describe('interactive', () => {
  it('publishes hover and press as visualState', () => {
    const { node, send } = build(Box({ modifiers: [interactive()] }));
    expect(states(node)).toEqual([]);

    send(UiEventType.PointerEnter);
    expect(states(node)).toEqual([UiVisualState.Hovered]);

    send(UiEventType.PointerDown);
    expect(states(node)).toEqual([UiVisualState.Hovered, UiVisualState.Pressed].sort());

    send(UiEventType.PointerUp);
    expect(states(node)).toEqual([UiVisualState.Hovered]);

    send(UiEventType.PointerLeave);
    expect(states(node)).toEqual([UiVisualState.Normal]);
  });

  it('clears the press when the pointer leaves while held', () => {
    const { node, send } = build(Box({ modifiers: [interactive()] }));
    send(UiEventType.PointerEnter);
    send(UiEventType.PointerDown);

    send(UiEventType.PointerLeave);

    expect(states(node)).toEqual([UiVisualState.Normal]);
  });

  it('listens for only the half it was asked for', () => {
    const hover = build(Box({ modifiers: [hoverable()] }));
    hover.send(UiEventType.PointerDown);
    expect(states(hover.node)).toEqual([]);

    const press = build(Box({ modifiers: [pressable()] }));
    press.send(UiEventType.PointerEnter);
    expect(states(press.node)).toEqual([]);
    press.send(UiEventType.PointerDown);
    expect(states(press.node)).toEqual([UiVisualState.Pressed]);
  });

  it('writes the styles for a state and restores the declared value after', () => {
    const options = {
      hover: true,
      press: true,
      hovered: { backgroundColor: '#222' },
      pressed: { backgroundColor: '#333' }
    };
    const { node, send } = build(Box({ backgroundColor: '#111', modifiers: [interactive(options)] }));
    expect(node.properties.get('backgroundColor')).toBe('#111');

    send(UiEventType.PointerEnter);
    expect(node.properties.get('backgroundColor')).toBe('#222');

    send(UiEventType.PointerDown);
    expect(node.properties.get('backgroundColor')).toBe('#333');

    send(UiEventType.PointerUp);
    expect(node.properties.get('backgroundColor')).toBe('#222');

    send(UiEventType.PointerLeave);
    expect(node.properties.get('backgroundColor')).toBe('#111');
  });

  it('marks the node for repaint when the state changes', () => {
    const { graph, node, send } = build(Box({ modifiers: [interactive()] }));
    graph.getDirtyNodes().take();

    send(UiEventType.PointerEnter);

    expect(graph.getDirtyNodes().has(node)).toBe(true);
  });

  it('is on every Button without being asked for', () => {
    const { node, send } = build(Button({ text: 'Save' }));
    send(UiEventType.PointerEnter);
    expect(states(node)).toEqual([UiVisualState.Hovered]);
  });

  it('keeps a button’s own modifiers, after the interaction one', () => {
    const { node, send } = build(Button({ text: 'Save', modifiers: [writer({ property: 'width', value: 99 })] }));
    expect(node.properties.get('width')).toBe(99);
    send(UiEventType.PointerEnter);
    expect(states(node)).toEqual([UiVisualState.Hovered]);
  });
});
