import { describe, expect, it } from 'vitest';

import { Button, Column, type UiNode } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { Tour, tourTarget, type TourProps } from './Tour';

/**
 * A 400 by 300 screen with two buttons to point at, the first at 20, 20
 * and 100 by 40, the second at 20, 200; and a tour of three steps, the
 * last pointing at nothing.
 */
function mount(props: Partial<TourProps> = {}) {
  const first = tourTarget();
  const second = tourTarget();
  const pressed: string[] = [];
  const ui = renderTest(
    Column(
      { width: 400, height: 300, padding: 20, gap: 140 },
      Button({ ref: first.ref, width: 100, height: 40, text: 'Compose', onClick: () => pressed.push('compose') }),
      Button({ ref: second.ref, width: 100, height: 40, text: 'Archive', onClick: () => pressed.push('archive') }),
      createComponent(Tour, {
        steps: [
          { target: first, title: 'Write a message', body: 'Start one here.' },
          { target: second, title: 'Clear it away', side: 'top' },
          { title: 'That is all' }
        ],
        ...props
      })
    ),
    { width: 400, height: 300 }
  );
  ui.frame();
  return { ui, pressed };
}

/** The box laid over the target, whose shadow is the dim. */
const holeOf = (nodes: readonly UiNode[]) =>
  nodes.find(node => Array.isArray(node.properties.get('boxShadows')) && node.properties.get('hitTestable') === false)!;

describe('Tour', () => {
  it('lights the first target, with room around it, and opens its card beside it', () => {
    const { ui } = mount();
    expect(ui.getLayout(holeOf(ui.allNodes()))).toEqual({ x: 12, y: 12, width: 116, height: 56 });
    const card = ui.getLayout(ui.getByRole('dialog', { name: 'Write a message' }));
    expect(card.y).toBe(20 + 40 + 8 + 8);
    expect(ui.getByText('1 of 3')).toBeDefined();
  });

  it('takes a press on the dim and passes one in the hole to the target', () => {
    const { ui, pressed } = mount();
    const press = (x: number, y: number) => {
      ui.fireEvent.pointerDown(x, y);
      ui.fireEvent.pointerUp(x, y);
      ui.frame();
    };
    // The second button, dimmed.
    press(70, 220);
    expect(pressed).toEqual([]);
    // The first, in the hole.
    press(70, 40);
    expect(pressed).toEqual(['compose']);
  });

  it('steps on to the next target and back, centres a step with none, and finishes with Done', () => {
    const asked: (number | null)[] = [];
    const { ui } = mount({ defaultStep: 0, onStepChange: step => asked.push(step) });
    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    ui.frame();
    expect(ui.getLayout(holeOf(ui.allNodes())).y).toBe(200 - 8);
    // Opened above the target, as the step asks.
    const card = ui.getLayout(ui.getByRole('dialog', { name: 'Clear it away' }));
    expect(card.y + card.height).toBe(200 - 8 - 8);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Back' }));
    ui.frame();
    expect(ui.queryByRole('dialog', { name: 'Write a message' })).not.toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    ui.frame();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    ui.frame();
    const last = ui.getLayout(ui.getByRole('dialog', { name: 'That is all' }));
    expect(last.x).toBe((400 - 280) / 2);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Done' }));
    ui.frame();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(asked).toEqual([1, 0, 1, 2, null]);
  });

  it('closes on Escape', () => {
    const { ui } = mount();
    // The card has the keyboard while it is open.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(holeOf(ui.allNodes())).toBeUndefined();
  });

  it('is not shown at all with no step', () => {
    const { ui } = mount({ defaultStep: null });
    expect(ui.queryByRole('dialog')).toBeNull();
  });
});
