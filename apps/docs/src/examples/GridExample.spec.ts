import { describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { GridTable } from './GridExample';

const VALUES = [
  'Canvas2D or WebGPU, chosen at startup',
  'One measurer for layout, paint and the caret',
  'The whole tree in a render worker'
] as const;

const NOTE = /the track is shared/;
const COLUMN_GAP = 16;

function mount(): Rendered {
  return renderTest(createComponent(GridTable, {}), { width: 620, height: 320 });
}

const valueXs = (ui: Rendered) => VALUES.map(text => ui.getLayout(ui.getByText(text)).x);

/**
 * The page's claim is that one track, not three rows agreeing with each
 * other, is what lines the values up, so the spec measures the tracks:
 * every value starts at the same x, that x follows the widest label
 * when it changes, and the note crosses both tracks and the gap.
 */
describe('the docs grid example', () => {
  it('starts every value at the same line, one label track and a gap in', () => {
    const ui = mount();
    const label = ui.getLayout(ui.getByText('Renderer'));
    const [first, second, third] = valueXs(ui);

    expect([second, third]).toEqual([first, first]);
    // Each label cell is the whole track, so a label's box is the
    // track's width, and the value column starts a column gap after it.
    expect(first).toBeCloseTo(label.x + label.width + COLUMN_GAP, 5);
  });

  it('moves every value, in every row, when one label gets longer', () => {
    const ui = mount();
    const before = { track: ui.getLayout(ui.getByText('Renderer')).width, values: valueXs(ui) };

    ui.fireEvent.click(ui.getByRole('button', { name: 'Longer label' }));
    ui.frame();

    const after = { track: ui.getLayout(ui.getByText('Renderer')).width, values: valueXs(ui) };

    // The label that changed is the middle row's, and the other two
    // rows move with it, because the track they share got wider.
    expect(after.track).toBeGreaterThan(before.track);
    expect(after.values).toEqual([after.values[0], after.values[0], after.values[0]]);
    for (let index = 0; index < VALUES.length; index++) {
      expect(after.values[index]! - before.values[index]!).toBeCloseTo(after.track - before.track, 5);
    }
  });

  it('runs the note across both tracks and the gap between them', () => {
    const ui = mount();
    const label = ui.getLayout(ui.getByText('Renderer'));
    const value = ui.getLayout(ui.getByText(VALUES[0]));
    const note = ui.getLayout(ui.getByText(NOTE));

    expect(note.x).toBe(label.x);
    expect(note.x + note.width).toBeCloseTo(value.x + value.width, 5);
    // Which is more than either track alone: the span swallows the gap.
    expect(note.width).toBeCloseTo(label.width + COLUMN_GAP + value.width, 5);
  });
});
