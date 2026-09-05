import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Column, Text, noKeyModifiers } from '@gesso/core';
import type { UiElement } from '@gesso/core';
import { Component } from '../Component';
import { Define } from '../decorators';
import { createComponent } from '../createComponent';
import type { DevtoolsEvent, UiTreeNode } from './DevtoolsProtocol';
import { treeText } from './DevtoolsProtocol';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * `ADOPTION_ROADMAP.md` A4: what a devtools panel outside the page can
 * ask a running application, and what it hears back.
 *
 * Through a real runtime, as the inspector's spec is, because the tree
 * snapshot reads the resolver for component names and the graph for
 * nodes by id, and the watched updates ride on the frame.
 */
@Define('devtools-card')
class DevtoolsCard extends Component {
  override render(): UiElement {
    return Box({ width: 120, height: 40 }, Text({ text: 'inside the card' }));
  }
}

function attach(mounted: MountedRuntime): DevtoolsEvent[] {
  const events: DevtoolsEvent[] = [];
  mounted.runtime.onDevtools(event => events.push(event));
  return events;
}

function find(node: UiTreeNode, predicate: (node: UiTreeNode) => boolean): UiTreeNode | undefined {
  if (predicate(node)) {
    return node;
  }
  for (const child of node.children) {
    const found = find(child, predicate);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

describe('the tree snapshot', () => {
  it('lists the application tree from its root, naming component anchors and text', () => {
    const mounted = mountRuntime(Column({}, createComponent(DevtoolsCard), Text({ text: 'after' })));
    mounted.frame();

    const snapshot = mounted.runtime.snapshotTree();

    expect(snapshot.root.type).toBe('column');
    // Column > [anchor > box > text, text]: five nodes including the root.
    expect(snapshot.nodes).toBe(5);
    const anchor = find(snapshot.root, node => node.component !== undefined);
    expect(anchor?.component).toBe('devtools-card');
    expect(anchor?.children[0]?.type).toBe('box');
    expect(anchor?.children[0]?.children[0]?.text).toBe('inside the card');
    expect(snapshot.root.children[1]?.text).toBe('after');
  });

  it('shortens long text and flattens its whitespace', () => {
    expect(treeText('a\n  b')).toBe('a b');
    expect(treeText('')).toBeUndefined();
    expect(treeText(42)).toBeUndefined();
    const long = 'x'.repeat(100);
    expect(treeText(long)).toHaveLength(40);
    expect(treeText(long)?.endsWith('…')).toBe(true);
  });

  it('survives a structured clone, which is what a postMessage does to it', () => {
    const mounted = mountRuntime(Column({}, createComponent(DevtoolsCard)));
    mounted.frame();

    const snapshot = mounted.runtime.snapshotTree();

    expect(structuredClone(snapshot)).toEqual(snapshot);
  });
});

describe('devtools requests', () => {
  it('answers `tree` with a snapshot and `inspect` with a report, or null for an unknown id', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();
    const events = attach(mounted);
    const boxId = mounted.runtime.debugRoot().firstChild!.id;

    mounted.runtime.handleDevtools({ kind: 'tree' });
    mounted.runtime.handleDevtools({ kind: 'inspect', id: boxId });
    mounted.runtime.handleDevtools({ kind: 'inspect', id: 'nope' });

    expect(events[0]?.kind).toBe('tree');
    expect(events[1]).toMatchObject({ kind: 'report', id: boxId, report: { type: 'box' } });
    expect(events[2]).toEqual({ kind: 'report', id: 'nope', report: null });
  });

  it('sends a snapshot when the tree is watched, and again only when the tree changes', () => {
    const width = new BehaviorSubject(10);
    const text = new BehaviorSubject('one');
    const mounted = mountRuntime(Column({}, Box({ width, height: 10 }), Text({ text })));
    mounted.frame();
    const events = attach(mounted);

    mounted.runtime.handleDevtools({ kind: 'watchTree', enabled: true });
    expect(events.map(event => event.kind)).toEqual(['tree']);

    // A box that only changed size is the same tree.
    width.next(20);
    mounted.frame();
    expect(events).toHaveLength(1);

    // Text is what the tree shows, so new text is a new snapshot.
    text.next('two');
    mounted.frame();
    expect(events).toHaveLength(2);
    const second = events[1];
    expect(second.kind === 'tree' && second.tree.root.children[1]?.text).toBe('two');

    mounted.runtime.handleDevtools({ kind: 'watchTree', enabled: false });
    text.next('three');
    mounted.frame();
    expect(events).toHaveLength(2);
  });

  it("keeps a selected node's report fresh, and reports it gone once", () => {
    const width = new BehaviorSubject(10);
    const mounted = mountRuntime(Column({}, Box({ width, height: 10 })));
    mounted.frame();
    const events = attach(mounted);
    const boxId = mounted.runtime.debugRoot().firstChild!.id;

    mounted.runtime.handleDevtools({ kind: 'select', id: boxId });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'report', id: boxId, report: { box: { width: 10 } } });

    width.next(30);
    mounted.frame();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ kind: 'report', report: { box: { width: 30 } } });

    // A frame that changed nothing about the node says nothing.
    mounted.runtime.resize(800, 600, 1);
    mounted.frame();
    expect(events).toHaveLength(2);

    // The node leaves with the old tree; the panel hears so once. (Ids
    // are positional, so the replacement must not put a node where the
    // box was: a same-shaped tree would carry the selection to the new
    // node, and the report would change rather than end.)
    mounted.runtime.reload(Column({}));
    mounted.frame();
    mounted.frame();
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ kind: 'report', id: boxId, report: null });
  });

  it('outlines a highlighted node without the layout inspector being on, and clears it', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();
    const boxId = mounted.runtime.debugRoot().firstChild!.id;
    expect(mounted.runtime.inspector.isEnabled).toBe(false);

    mounted.runtime.handleDevtools({ kind: 'highlight', id: boxId });
    mounted.frame();
    expect(mounted.runtime.inspector.highlightedNode?.id).toBe(boxId);
    expect(mounted.runtime.inspector.overlay(0).shapes.length).toBeGreaterThan(0);
    // Without the toggle there is no heatmap to keep repainting for.
    expect(mounted.runtime.inspector.overlay(0).nextChange).toBeUndefined();

    mounted.runtime.handleDevtools({ kind: 'highlight', id: null });
    expect(mounted.runtime.inspector.overlay(0).shapes).toEqual([]);

    // An id the tree does not have points at nothing.
    mounted.runtime.handleDevtools({ kind: 'highlight', id: 'nope' });
    expect(mounted.runtime.inspector.highlightedNode).toBeNull();
  });

  it('sends frame metrics while frames are watched, and nothing otherwise', () => {
    const width = new BehaviorSubject(10);
    const mounted = mountRuntime(Column({}, Box({ width, height: 10 })));
    mounted.frame();
    const events = attach(mounted);

    width.next(11);
    mounted.frame();
    expect(events).toEqual([]);

    mounted.runtime.handleDevtools({ kind: 'watchFrames', enabled: true });
    width.next(12);
    mounted.frame();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'frame', metrics: { nodes: expect.any(Number) } });

    mounted.runtime.handleDevtools({ kind: 'watchFrames', enabled: false });
    width.next(13);
    mounted.frame();
    expect(events).toHaveLength(1);
  });

  it('turns the layout inspector on for a panel and reports the hovered node to it', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 100, height: 100 })));
    mounted.frame();
    const events = attach(mounted);

    mounted.runtime.handleDevtools({ kind: 'inspector', enabled: true });
    expect(mounted.runtime.inspector.isEnabled).toBe(true);
    // The toggle itself is reported, with nothing under a pointer that is nowhere.
    expect(events).toEqual([{ kind: 'hover', report: null }]);

    mounted.runtime.input.pointer.pointerMove(50, 50, 0, noKeyModifiers());
    mounted.frame();
    const hover = events.find(event => event.kind === 'hover' && event.report !== null);
    expect(hover).toMatchObject({ kind: 'hover', report: { type: 'box' } });

    mounted.runtime.handleDevtools({ kind: 'inspector', enabled: false });
    expect(mounted.runtime.inspector.isEnabled).toBe(false);
  });

  it('drops the highlight when the node leaves the tree', () => {
    const mounted = mountRuntime(Column({}, Box({ width: 10, height: 10 })));
    mounted.frame();
    attach(mounted);
    const boxId = mounted.runtime.debugRoot().firstChild!.id;
    mounted.runtime.handleDevtools({ kind: 'highlight', id: boxId });

    mounted.runtime.reload(Column({}, Text({ text: 'replaced' })));
    mounted.frame();

    expect(mounted.runtime.inspector.highlightedNode).toBeNull();
  });
});
