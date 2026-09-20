import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { List, Row } from './InputsOutputsExample';

const SIZE = { width: 320, height: 200 };

/** The centre of a node, which is where a pointer has to be to hover it. */
function centreOf(ui: ReturnType<typeof renderTest>, name: string): { x: number; y: number } {
  const box = ui.getLayout(ui.getByRole('button', { name }));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * The page's four claims, one test each.
 *
 * An input is a cell fed from whatever the parent passed, so a value
 * and an Observable are the same thing to the component; an optional
 * input takes a default that keeps following its source; an output is
 * fired with `emit` and reaches the parent's handler, or nobody when
 * the parent passed nothing; and `into(subject)` turns an output into
 * a stream a parent can merge.
 */
describe('the docs inputs and outputs example', () => {
  it('follows the Observable the parent passed, rather than reading it once', () => {
    const title = new BehaviorSubject('Alpha');
    const ui = renderTest(createComponent(Row, { title, onPick: () => {} }), SIZE);

    expect(ui.getByText('Alpha')).toBeDefined();

    title.next('Beta');
    ui.frame();

    // The body ran once, at mount. What changed is the cell behind the
    // binding, which is the whole of what a parent passing an
    // Observable buys.
    expect(ui.getByText('Beta')).toBeDefined();
    expect(ui.queryByText('Alpha')).toBeNull();
  });

  it('holds the default for an optional input, and gives it up when the source speaks', () => {
    const emphasis = new BehaviorSubject<'normal' | 'strong' | undefined>(undefined);
    const ui = renderTest(createComponent(Row, { title: 'Alpha', emphasis, onPick: () => {} }), SIZE);

    // `input(inputs.emphasis, 'normal')`: undefined is not a value the
    // derivation ever sees, so the first frame draws the default.
    expect(ui.getByText('Alpha').getProperty('fontWeight')).toBe(400);

    emphasis.next('strong');
    ui.frame();

    // The default kept following the source rather than replacing it.
    expect(ui.getByText('Alpha').getProperty('fontWeight')).toBe(700);
  });

  it('reaches the parent’s handlers with emit', () => {
    const picked: string[] = [];
    let hovers = 0;
    const ui = renderTest(
      createComponent(Row, {
        title: 'Alpha',
        onPick: (title: string) => picked.push(title),
        onHover: () => (hovers += 1)
      }),
      SIZE
    );

    ui.fireEvent.click(ui.getByRole('button', { name: 'Alpha' }));
    ui.frame();

    // `emit(inputs.title.value)`: the handler is called with the value
    // the cell holds now, which is what a `.value` read in a handler is
    // for.
    expect(picked).toEqual(['Alpha']);

    const centre = centreOf(ui, 'Alpha');
    ui.fireEvent.pointerMove(centre.x, centre.y);
    ui.frame();

    expect(hovers).toBe(1);
  });

  it('emits into nobody when the parent passed no handler', () => {
    const ui = renderTest(createComponent(Row, { title: 'Alpha', onPick: () => {} }), SIZE);
    const centre = centreOf(ui, 'Alpha');

    // `onHover` was not passed, and the component fires it anyway. The
    // page says that is fine, so the test is that nothing throws and
    // the row is still there afterwards.
    expect(() => {
      ui.fireEvent.pointerMove(centre.x, centre.y);
      ui.frame();
    }).not.toThrow();
    expect(ui.getByText('Alpha')).toBeDefined();
  });

  it('lets a parent merge many rows’ outputs into one stream', () => {
    const ui = renderTest(createComponent(List, {}), SIZE);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Beta' }));
    ui.frame();

    // `into(picked)` on three rows, one Subject, one caption: the
    // parent hears which row it was without holding a handler per row.
    expect(ui.getByText('picked Beta')).toBeDefined();

    const centre = centreOf(ui, 'Gamma');
    ui.fireEvent.pointerMove(centre.x, centre.y);
    ui.frame();

    // The second output, merged into the same stream, so the caption
    // is the last thing that happened rather than the last pick.
    expect(ui.getByText('hovering')).toBeDefined();
  });
});
