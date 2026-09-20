import { describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { NOTES, PresenceStage } from './PresenceExample';

/**
 * The layer `Presence` wraps a child in, which is the node the motion
 * writes to. It is the nearest absolutely positioned ancestor: the
 * stack `Presence` lays its children out in.
 */
function layerOf(node: UiNode): UiNode {
  let current: UiNode | null = node;
  while (current !== null && current.properties.get('position') !== 'absolute') {
    current = current.parent;
  }
  return current!;
}

function transformOf(node: UiNode): { x?: number; y?: number; scaleX?: number; translateY?: number } | undefined {
  return node.properties.get('transform') as
    | { x?: number; y?: number; scaleX?: number; translateY?: number }
    | undefined;
}

/** Runs frames while anything is still asking for one, and counts them. */
function drain(ui: Rendered, limit = 400): number {
  let frames = 0;
  while (ui.clock.isPending && frames < limit) {
    frames++;
    ui.frame();
  }
  return frames;
}

const mount = () => renderTest(createComponent(PresenceStage, {}), { width: 560, height: 300 });

/**
 * The claim this page makes is about a node that has logically left:
 * it is still there, still animating, and dropped only afterwards. So
 * the spec looks for the node after the removal rather than for the
 * end state, which an immediate removal would reach just as well.
 */
describe('the docs presence example', () => {
  it('keeps a dismissed notice in the tree until its exit has finished', () => {
    const ui = mount();
    drain(ui);
    const title = ui.getByText(NOTES.saved.title);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Dismiss' }));
    ui.frame();
    ui.frame();

    // Nothing asks for this child any more, and it is still here: the
    // same node, not a copy of it, being animated out.
    expect(ui.queryByText(NOTES.saved.title)).toBe(title);
    expect(transformOf(layerOf(title))!.scaleX).toBeLessThan(1);

    const frames = drain(ui);
    expect(frames).toBeGreaterThan(4);
    expect(ui.queryByText(NOTES.saved.title)).toBeNull();
  });

  it('holds both notices on screen while one replaces the other', () => {
    const ui = mount();
    drain(ui);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Show offline' }));
    ui.frame();

    // A different key is a swap rather than a change, so the two
    // overlap for the length of the transition instead of the first
    // one disappearing on the frame the second is asked for.
    expect(ui.queryByText(NOTES.saved.title)).not.toBeNull();
    expect(ui.queryByText(NOTES.offline.title)).not.toBeNull();

    drain(ui);
    expect(ui.queryByText(NOTES.saved.title)).toBeNull();
    expect(ui.queryByText(NOTES.offline.title)).not.toBeNull();
  });

  it('moves the arriving notice with the transform translation, about its own centre', () => {
    const ui = mount();
    drain(ui);
    ui.fireEvent.click(ui.getByRole('button', { name: 'Dismiss' }));
    drain(ui);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Show saved' }));
    ui.frame();

    const layer = layerOf(ui.getByText(NOTES.saved.title));
    const box = ui.getLayout(layer);
    const written = transformOf(layer)!;

    // `translateY`, not `y`: the transform's `x` and `y` are its pivot,
    // and the composer measures that at the node's own middle so a
    // scale grows from the centre rather than out of the corner.
    expect(written.x).toBeCloseTo(box.width / 2, 3);
    expect(written.y).toBeCloseTo(box.height / 2, 3);
    expect(written.translateY).toBeGreaterThan(0);

    drain(ui);
    // Home, with the overrides handed back rather than left at an
    // identity transform, so the renderer has nothing to multiply by.
    expect(layer.properties.has('transform')).toBe(false);
  });
});
