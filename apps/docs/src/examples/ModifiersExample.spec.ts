import { describe, expect, it } from 'vitest';

import { UiVisualState, type LayoutBox, type UiNode, type UiVisualStateSet } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { ModifierSurface } from './ModifiersExample';

const SIZE = { width: 460, height: 360 };

function surface(): Rendered {
  return renderTest(createComponent(ModifierSurface, {}), SIZE);
}

/** The middle of a node's box, in the coordinates a pointer arrives in. */
function centreOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box: LayoutBox = ui.getLayout(node);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** The element the three modifiers are attached to. */
function target(ui: Rendered): UiNode {
  return ui.getByText('Hover, press, or Tab to me').parent as UiNode;
}

/** What one of the readout lines currently says. */
function readout(ui: Rendered, prefix: RegExp): string {
  return String(ui.getByText(prefix).getProperty('text'));
}

/** The visual states published on the node, as plain strings. */
function states(node: UiNode): string[] {
  return [...((node.getProperty('visualState') as UiVisualStateSet | undefined) ?? [])];
}

/**
 * The page's two claims, measured.
 *
 * The first is the override cascade: a modifier writes over what the
 * element declared, and giving up the write brings the declared value
 * back rather than a default. The second is identity: arguments are
 * compared by `Object.is`, so a shared value survives a render and one
 * built inside the render is a detach and an attach.
 */
describe('the docs modifiers example', () => {
  it('writes over the declared background while hovered, and hands it back on leave', () => {
    const ui = surface();
    const node = target(ui);
    expect(node.getProperty('backgroundColor')).toBe('controlBackground');

    const point = centreOf(ui, node);
    ui.fireEvent.pointerMove(point.x, point.y);
    ui.frame();
    expect(node.getProperty('backgroundColor')).toBe('controlBackgroundHovered');
    expect(states(node)).toEqual([UiVisualState.Hovered]);

    // A press writes over the hover, because `pressed` is applied on
    // top of `hovered` rather than instead of it.
    ui.fireEvent.pointerDown(point.x, point.y);
    ui.frame();
    expect(node.getProperty('backgroundColor')).toBe('controlBackgroundPressed');
    expect(states(node)).toEqual([UiVisualState.Hovered, UiVisualState.Pressed]);

    ui.fireEvent.pointerUp(point.x, point.y);
    // The example's own padding, which is outside the box entirely.
    ui.fireEvent.pointerMove(2, 2);
    ui.frame();

    // Not a default, and not transparent: the value the element
    // declared, restored through the same cascade that overrode it.
    expect(node.getProperty('backgroundColor')).toBe('controlBackground');
    expect(states(node)).toEqual([UiVisualState.Normal]);
  });

  it('decorates the node while it holds focus, and only then', () => {
    const ui = surface();
    const node = target(ui);
    expect(node.decorations).toBeNull();

    ui.fireEvent.tab();
    ui.frame();
    expect(node.decorations).not.toBeNull();

    ui.fireEvent.blur();
    ui.frame();
    expect(node.decorations).toBeNull();
  });

  it('reports the measured box, which is the box layout gave the node', () => {
    const ui = surface();
    const box = ui.getLayout(target(ui));

    expect(readout(ui, /^measured /)).toBe(`measured ${Math.round(box.width)} x ${Math.round(box.height)}`);
  });

  it('re-attaches the modifier whose arguments were built in the render, and not the shared one', () => {
    const ui = surface();
    expect(readout(ui, /^shared value: /)).toBe('shared value: attached 1');
    expect(readout(ui, /^built in the render: /)).toBe('built in the render: attached 1');

    const point = centreOf(ui, ui.getByRole('button', { name: 'Render again' }));
    for (let press = 0; press < 4; press++) {
      ui.fireEvent.pointerDown(point.x, point.y);
      ui.fireEvent.pointerUp(point.x, point.y);
      ui.frame();
    }

    // Four renders later: the shared arguments matched every time and
    // the modifier was never touched; the fresh object was a new
    // argument every time, and a kind with no `update` answers that by
    // detaching and attaching again.
    expect(readout(ui, /^shared value: /)).toBe('shared value: attached 1');
    expect(readout(ui, /^built in the render: /)).toBe('built in the render: attached 5');
  });
});
