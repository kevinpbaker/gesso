import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, Text, darkTheme, defineModifier, hoverable, noKeyModifiers } from '@gesso/core';
import { Component } from '../Component';
import { Define } from '../decorators';
import { createComponent } from '../createComponent';
import type { UiElement } from '@gesso/core';
import { formatNodeReport, printPropValue } from './NodeReport';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * `ROADMAP.md` F7's inspector: what a node is, as plain data.
 *
 * Driven through a real runtime because every source the report reads
 * belongs to one: the graph's bindings, the builder's modifier sets and
 * the resolver's component hosts are each private to a different object
 * and none of them is reachable from a spec that stubbed the others.
 */
const writer = defineModifier<{ property: string; value: unknown }>({
  name: 'writer',
  attach(host, args) {
    host.set(args.property, args.value);
  }
});

@Define('inspected-card')
class InspectedCard extends Component {
  override render(): UiElement {
    return Box({ width: 120, height: 40 }, Text({ text: 'inside' }));
  }
}

describe('inspectNode', () => {
  it('says what the node is and how big it is', () => {
    const mounted = mountRuntime(Column({ padding: 10 }, Box({ width: 120, height: 40 })));
    mounted.frame();
    const node = mounted.runtime.debugRoot().firstChild!;

    const report = mounted.runtime.inspectNode(node);

    expect(report.type).toBe('box');
    expect(report.box).toEqual({ x: 10, y: 10, width: 120, height: 40 });
    expect(report.explanation).toContain('width  120');
  });

  it('names the component that rendered the node, and the one above it', () => {
    const mounted = mountRuntime(Column({}, createComponent(InspectedCard)));
    mounted.frame();
    const card = mounted.runtime.debugRoot().firstChild!.firstChild!;

    const report = mounted.runtime.inspectNode(card);

    expect(report.type).toBe('box');
    expect(report.owners.map(owner => owner.name)).toEqual(['inspected-card']);
  });

  it('has no owner for a node the application wrote out itself', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);

    expect(report.owners).toEqual([]);
  });

  it('marks a property a modifier is writing, and says what the element declared', () => {
    const mounted = mountRuntime(
      Column({}, Box({ width: 120, height: 40, modifiers: [writer({ property: 'width', value: 200 })] }))
    );
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);
    const width = report.props.find(prop => prop.name === 'width');

    expect(width).toMatchObject({ value: '200', origin: 'modifier' });
    expect(width?.source).toBe('set by writer (declared 120)');
  });

  it('marks a bound property as bound', () => {
    const width = new BehaviorSubject(60);
    const mounted = mountRuntime(Column({}, Box({ width, height: 40 })));
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);

    expect(report.props.find(prop => prop.name === 'width')).toMatchObject({ value: '60', origin: 'binding' });
  });

  it('names the stream feeding a bound property, what it last said and when', () => {
    // The three things "bound" never said. A prop that stopped
    // updating and one whose stream has said nothing since the screen
    // was built are the same picture without them.
    const width = new BehaviorSubject(60);
    const labelled = new BehaviorSubject(40) as BehaviorSubject<number> & { label: string };
    labelled.label = 'card.height';
    const mounted = mountRuntime(Column({}, Box({ width, height: labelled })));
    mounted.frame();
    width.next(80);
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);
    const stream = report.props.find(prop => prop.name === 'width')?.stream;

    expect(stream).toMatchObject({ kind: 'observable', value: '80', emissions: 2, connected: true });
    // An epoch stamp, so a panel a thread away can subtract its own
    // clock from it.
    expect(stream?.emittedAt).toBeGreaterThan(Date.now() - 60_000);
    // A labelled cell says where the value comes from by name.
    expect(report.props.find(prop => prop.name === 'height')?.stream).toMatchObject({
      source: 'card.height',
      kind: 'cell'
    });
  });

  it('counts the subscriptions a node holds, so the panel can add them up per component', () => {
    const width = new BehaviorSubject(60);
    const mounted = mountRuntime(Column({}, Box({ width, height: 40, onClick: () => {} })));
    mounted.frame();

    const tree = mounted.runtime.snapshotTree();

    // One bound property and one listener on the box.
    expect(tree.root.children[0]?.subscriptions).toBe(2);
    expect(tree.subscriptions).toBeGreaterThanOrEqual(2);
  });

  it('lists the modifiers attached to the node', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10, modifiers: [hoverable()] })));
    mounted.frame();

    expect(mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!).modifiers).toEqual(['interactive']);
  });

  it('reports what the node inherits and who provided it', () => {
    const mounted = mountRuntime(Column({ theme: darkTheme }, Box({ width: 10, height: 10 })));
    mounted.frame();
    const root = mounted.runtime.debugRoot();

    const inherited = mounted.runtime.inspectNode(root.firstChild!).environment.find(entry => entry.key === 'theme');
    const provider = mounted.runtime.inspectNode(root).environment.find(entry => entry.key === 'theme');

    expect(inherited?.provided).toBe(false);
    expect(provider?.provided).toBe(true);
  });

  it('carries the semantics record when the node has one', () => {
    const mounted = mountRuntime(Column({}, Button({ label: 'Save', text: 'Save' })));
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);

    expect(report.semantics).toMatchObject({ role: 'button', label: 'Save' });
  });

  it('crosses a thread boundary: everything in it survives a structured clone', () => {
    const mounted = mountRuntime(
      Column({ theme: darkTheme }, Box({ width: 10, height: 10, modifiers: [hoverable()] }))
    );
    mounted.frame();

    const report = mounted.runtime.inspectNode(mounted.runtime.debugRoot().firstChild!);

    // The whole reason the report is strings: `structuredClone` is what
    // `postMessage` does, and it throws on a function, a class instance
    // or an Observable.
    expect(structuredClone(report)).toEqual(report);
  });
});

describe('the inspect listener', () => {
  it('says what a node listens for, and what it covers at the pointer', () => {
    // The dead click: an absolutely positioned button, then a positioned
    // column that paints over it and takes the press.
    let button: UiElement | undefined;
    const mounted = mountRuntime(
      Box(
        { width: 300, height: 300, position: 'relative' },
        (button = Button({ position: 'absolute', left: 10, top: 10, width: 40, height: 40, onClick: () => {} })),
        Column({ position: 'relative', width: 300, height: 300 }, Text({ text: 'content' }))
      )
    );
    void button;
    mounted.frame();
    const root = mounted.runtime.debugRoot();
    const column = root.lastChild!;
    const pressed = root.firstChild!;

    mounted.runtime.input.pointer.pointerMove(20, 20, 0, noKeyModifiers());
    expect(mounted.runtime.input.pointer.hoveredNode).toBe(column);

    const report = mounted.runtime.inspectNode(column);
    expect(report.listens).toEqual([]);
    expect(report.beneath.map(under => under.id)).toEqual([pressed.id, root.id]);
    // A button listens for its own click and for the pointer states its
    // default interaction paints.
    expect(report.beneath[0]?.type).toBe('button');
    expect(report.beneath[0]?.listens).toContain('click');

    // The button itself covers only the root, and says it listens.
    const own = mounted.runtime.inspectNode(pressed);
    expect(own.listens).toContain('click');
    expect(own.beneath.map(under => under.id)).toEqual([root.id]);

    // Away from the pointer there is nothing to report beneath.
    mounted.runtime.input.pointer.pointerMove(250, 250, 0, noKeyModifiers());
    expect(mounted.runtime.inspectNode(pressed).beneath).toEqual([]);
    expect(formatNodeReport(mounted.runtime.inspectNode(column))).toContain('beneath, at the pointer:');
  });

  it('reports the hovered node while the inspector is on', () => {
    const seen: (string | null)[] = [];
    const mounted = mountRuntime(Column({ padding: 10 }, Box({ width: 120, height: 40 })), {
      onCreate: runtime => runtime.onInspect(report => seen.push(report?.id ?? null))
    });
    mounted.frame();
    mounted.runtime.setInspectorEnabled(true);
    mounted.runtime.input.pointer.pointerMove(40, 20, 0, noKeyModifiers());
    mounted.frame();

    expect(seen.at(-1)).toBe(mounted.runtime.debugRoot().firstChild!.id);
  });
});

describe('printPropValue', () => {
  it('prints the values a canvas UI actually holds', () => {
    expect(printPropValue(new Set(['hovered', 'pressed']))).toBe('Set { hovered, pressed }');
    expect(printPropValue(() => {})).toContain('ƒ');
    expect(printPropValue([1, 'two'])).toBe('[1, two]');
    expect(printPropValue({ x: 1 })).toBe('{"x":1}');
    expect(printPropValue(undefined)).toBe('undefined');
    expect(printPropValue(null)).toBe('null');
  });

  it('survives a value that cannot be stringified', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => printPropValue(cyclic)).not.toThrow();
  });
});

describe('formatNodeReport', () => {
  it('prints a report for a console or a failure message', () => {
    const mounted = mountRuntime(Column({}, createComponent(InspectedCard)));
    mounted.frame();
    const card = mounted.runtime.debugRoot().firstChild!.firstChild!;

    const printed = formatNodeReport(mounted.runtime.inspectNode(card));

    expect(printed).toContain('rendered by inspected-card');
    expect(printed).toContain('props:');
    expect(printed).toContain('width = 120');
  });
});
