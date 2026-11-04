import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { DirtyFlags } from './DirtyFlags';
import { UiGraph } from './UiGraph';
import type { UiNode } from './UiNode';
import { UiNodeType } from './UiNodeType';
import { UiEnvironmentKeys } from '../environment/UiEnvironmentKeys';
import { darkTheme, lightTheme } from '../environment/UiTheme';

/** A frame on a board: a held box, a column in it, and a text in that. */
function board() {
  const graph = new UiGraph();
  const frame = graph.createNode('frame', UiNodeType.Box);
  const column = graph.createNode('column', UiNodeType.Column);
  const text = graph.createNode('text', UiNodeType.Text);
  graph.appendChild(graph.root, frame);
  graph.appendChild(frame, column);
  graph.appendChild(column, text);
  graph.getDirtyNodes().take();
  for (const node of [graph.root, frame, column, text]) {
    node.dirtyFlags = DirtyFlags.None;
  }
  return { graph, frame, column, text };
}

const dirty = (graph: UiGraph): UiNode[] => [...graph.getDirtyNodes().values()];

describe('UiGraph.hold', () => {
  it('keeps the marks of a held subtree out of the frame, and gives them back on release', () => {
    // A board of hundreds of live screens, most out of view: what their
    // clocks write costs a property write each, and nothing else.
    const { graph, frame, column, text } = board();
    graph.hold(frame);
    graph.updateNodeProperty(text, 'text', 'tick 1', DirtyFlags.Layout | DirtyFlags.Paint);
    graph.updateNodeProperty(column, 'gap', 4, DirtyFlags.Layout);
    expect(dirty(graph)).toEqual([]);
    expect(text.getProperty('text')).toBe('tick 1');

    graph.release(frame);
    expect(dirty(graph)).toEqual([text, column]);
    expect(text.dirtyFlags).toBe(DirtyFlags.Layout | DirtyFlags.Paint);
    expect(column.dirtyFlags).toBe(DirtyFlags.Layout);
  });

  it('holds the descendants, not the held node itself', () => {
    const { graph, frame } = board();
    graph.hold(frame);
    graph.updateNodeProperty(frame, 'width', 390, DirtyFlags.Layout);
    expect(dirty(graph)).toEqual([frame]);
  });

  it('marks a node that was marked many times while held once, with every flag it was given', () => {
    const { graph, frame, text } = board();
    graph.hold(frame);
    for (let tick = 0; tick < 100; tick++) {
      graph.updateNodeProperty(text, 'text', `tick ${tick}`, DirtyFlags.Paint);
    }
    graph.markDirty(text, DirtyFlags.Semantics);
    graph.release(frame);
    expect(dirty(graph)).toEqual([text]);
    expect(text.dirtyFlags).toBe(DirtyFlags.Paint | DirtyFlags.Semantics);
  });

  it('holds what is attached inside a held subtree, and lets it go with the rest', () => {
    const { graph, frame, column } = board();
    graph.hold(frame);
    const added = graph.createNode('added', UiNodeType.Text);
    graph.appendChild(column, added);
    expect(added.heldBy).toBe(frame);
    graph.markDirty(added, DirtyFlags.Paint);
    expect(dirty(graph)).not.toContain(added);
    graph.release(frame);
    expect(added.heldBy).toBeNull();
    expect(dirty(graph)).toContain(added);
  });

  it('forgets a mark on a node removed while it was held', () => {
    const { graph, frame, column, text } = board();
    graph.hold(frame);
    graph.markDirty(text, DirtyFlags.Paint);
    graph.removeNode(text);
    graph.release(frame);
    expect(dirty(graph)).toEqual([column]);
  });

  it('stops a change to a provider above at the held node, and passes it on when let go', () => {
    // A theme changed over a board walked every node of every frame.
    const { graph, frame, column, text } = board();
    for (const node of [frame, column, text]) {
      node.environment = graph.buildNodeEnvironment(node);
    }
    graph.hold(frame);
    graph.updateNodeProperty(graph.root, 'theme', darkTheme, DirtyFlags.Environment);
    graph.processEnvironmentDirty();
    expect(frame.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    expect(text.environment!.get(UiEnvironmentKeys.theme)).toBe(lightTheme);
    expect(dirty(graph)).not.toContain(text);

    graph.release(frame);
    expect(column.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    expect(text.environment!.get(UiEnvironmentKeys.theme)).toBe(darkTheme);
    expect(dirty(graph)).toContain(text);
  });

  it('writes what a bound stream produces while held, so what is let go shows the latest', () => {
    const { graph, frame, text } = board();
    const ticks = new BehaviorSubject('tick 0');
    graph.bind(text, 'text', ticks, DirtyFlags.Layout | DirtyFlags.Paint);
    graph.getDirtyNodes().take();
    text.dirtyFlags = DirtyFlags.None;
    graph.hold(frame);
    ticks.next('tick 1');
    ticks.next('tick 2');
    expect(dirty(graph)).toEqual([]);
    graph.release(frame);
    expect(text.getProperty('text')).toBe('tick 2');
    expect(dirty(graph)).toEqual([text]);
  });

  it('keeps a held subtree inside another held until the outer one is let go, then its own', () => {
    const { graph, frame, column, text } = board();
    graph.hold(column);
    graph.hold(frame);
    expect(text.heldBy).toBe(frame);
    graph.markDirty(text, DirtyFlags.Paint);
    graph.release(frame);
    // The column still holds what is beneath it.
    expect(text.heldBy).toBe(column);
    expect(dirty(graph)).not.toContain(text);
    graph.release(column);
    expect(dirty(graph)).toContain(text);
  });
});
