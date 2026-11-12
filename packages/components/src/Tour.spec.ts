import { describe, expect, it } from 'vitest';

import { Button, Column, type UiNode } from 'gesso-core';
import { createComponent, StartingInputs } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Tour, tourTarget, type TourProps } from './Tour';

/**
 * A 400 by 300 screen with two buttons to point at, the first at 20, 20
 * and 100 by 40, the second at 20, 200; and a tour of three steps, the
 * last pointing at nothing.
 */
function mount(props: Partial<TourProps> = {}, moment?: Record<string, Record<string, unknown>>) {
  const first = tourTarget();
  const second = tourTarget();
  const pressed: string[] = [];
  const screen = Column(
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
  );
  const ui = renderTest(
    moment === undefined ? screen : createComponent(StartingInputs, { of: moment, children: screen }),
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
    const dim = holeOf(ui.allNodes());
    let time = 1000;
    const settle = () => {
      for (let i = 0; i < 30; i++) {
        time += 16;
        ui.frame(time);
      }
    };
    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    ui.frame(time);
    time += 100;
    ui.frame(time);
    // The same dim, gliding: not made again, so it does not fade out and back in, and part way there.
    expect(holeOf(ui.allNodes())).toBe(dim);
    const partWay = ui.getLayout(dim).y;
    expect(partWay).toBeGreaterThan(20 - 8);
    expect(partWay).toBeLessThan(200 - 8);
    settle();
    expect(ui.getLayout(dim)).toEqual({ x: 12, y: 200 - 8, width: 116, height: 56 });
    // Opened above the target, as the step asks.
    const card = ui.getLayout(ui.getByRole('dialog', { name: 'Clear it away' }));
    expect(card.y + card.height).toBe(200 - 8 - 8);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Back' }));
    settle();
    expect(ui.queryByRole('dialog', { name: 'Write a message' })).not.toBeNull();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    settle();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Next' }));
    settle();
    const last = ui.getLayout(ui.getByRole('dialog', { name: 'That is all' }));
    expect(last.x).toBe((400 - 280) / 2);
    // Still the one dim, its hole shrunk to a point in the middle of the last target.
    expect(holeOf(ui.allNodes())).toBe(dim);
    expect(ui.getLayout(dim)).toEqual({ x: 20 + 50, y: 200 + 20, width: 0, height: 0 });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Done' }));
    ui.frame();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(asked).toEqual([1, 0, 1, 2, null]);
  });

  it('keeps the keyboard in the card, and lets it go to the target when it is not modal', async () => {
    const modal = mount();
    const compose = modal.ui.getByRole('button', { name: 'Compose' });
    modal.ui.fireEvent.focus(compose);
    modal.ui.frame();
    // Refused: the keyboard stays in the card.
    expect(compose).not.toHaveFocus();

    const free = mount({ modal: false });
    // The card takes the keyboard on the turn after it opens.
    await new Promise(done => setTimeout(done, 0));
    free.ui.frame();
    expect(free.ui.getByRole('dialog', { name: 'Write a message' })).toHaveFocus();
    const target = free.ui.getByRole('button', { name: 'Compose' });
    free.ui.fireEvent.focus(target);
    free.ui.frame();
    expect(target).toHaveFocus();
    // A press outside the hole is still the dim's.
    free.ui.fireEvent.pointerDown(70, 220);
    free.ui.fireEvent.pointerUp(70, 220);
    free.ui.frame();
    expect(free.pressed).toEqual([]);
  });

  it('closes on Escape', () => {
    const { ui } = mount();
    // The card has the keyboard while it is open.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(ui.queryByRole('dialog')).toBeNull();
    expect(holeOf(ui.allNodes())).toBeUndefined();
  });

  it('is drawn at a later step as a moment of the screen', () => {
    const { ui } = mount({}, { Tour: { step: 1 } });
    expect(ui.getByRole('dialog', { name: 'Clear it away' })).toBeDefined();
    expect(ui.getByText('2 of 3')).toBeDefined();
  });

  it('is not shown at all with no step', () => {
    const { ui } = mount({ defaultStep: null });
    expect(ui.queryByRole('dialog')).toBeNull();
  });
});
