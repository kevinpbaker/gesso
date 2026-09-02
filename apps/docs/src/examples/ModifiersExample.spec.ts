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
 * back rather than a default. The second is the argument comparison:
 * arguments are compared by value, so an object built inside the render
 * that holds the same handler survives the render, and one holding a
 * handler written inline is a detach and an attach.
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

  it('re-attaches the modifier whose handler was written in the render, and neither of the others', () => {
    const ui = surface();
    expect(readout(ui, /^shared value: /)).toBe('shared value: attached 1');
    expect(readout(ui, /^equal object: /)).toBe('equal object: attached 1');
    expect(readout(ui, /^new callback: /)).toBe('new callback: attached 1');

    const point = centreOf(ui, ui.getByRole('button', { name: 'Render again' }));
    for (let press = 0; press < 4; press++) {
      ui.fireEvent.pointerDown(point.x, point.y);
      ui.fireEvent.pointerUp(point.x, point.y);
      ui.frame();
    }

    // Four renders later: the shared arguments matched on identity and
    // the fresh but equal object matched on its contents, so neither
    // modifier was touched. The third box built a new function every
    // render, which is a new argument whatever object carries it, and a
    // kind with no `update` answers that by detaching and attaching
    // again.
    expect(readout(ui, /^shared value: /)).toBe('shared value: attached 1');
    expect(readout(ui, /^equal object: /)).toBe('equal object: attached 1');
    expect(readout(ui, /^new callback: /)).toBe('new callback: attached 5');
  });
});
