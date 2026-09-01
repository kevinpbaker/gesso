import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { FlexBar } from './FlexExample';

/** The row is 12 px of padding on each side of whatever width it is. */
const PADDING = 24;
/** Three 10 px gaps between the four items. */
const GAPS = 30;

function mount(): Rendered {
  return renderTest(createComponent(FlexBar, {}), { width: 620, height: 260 });
}

/** Steps the row's width on: 520 to 400 to 300. */
function narrow(ui: Rendered): void {
  ui.fireEvent.click(ui.getByRole('button', { name: 'Width' }));
  ui.frame();
}

const tiles = (ui: Rendered) => ({
  one: ui.getLayout(ui.getByText('grow 1')),
  two: ui.getLayout(ui.getByText('grow 2')),
  fixed: ui.getLayout(ui.getByText('fixed 96')),
  basis: ui.getLayout(ui.getByText('basis 140'))
});

/**
 * The page claims three things about the four items, and each one is a
 * number: the grow shares are exact, the item that opted out of
 * shrinking keeps its width while the others give theirs up, and
 * wrapping moves an item onto a second line a `rowGap` below.
 */
describe('the docs flex example', () => {
  it('splits the leftover space by grow factor, and leaves nothing over', () => {
    const ui = mount();
    const { one, two, fixed, basis } = tiles(ui);

    // `flex` sets a basis of 0, so each share is of the whole leftover
    // and owes nothing to what the item itself measures.
    expect(two.width).toBeCloseTo(one.width * 2, 5);
    expect(fixed.width).toBe(96);
    expect(basis.width).toBe(140);
    // The four items and the three gaps are the row's content box.
    expect(one.width + two.width + fixed.width + basis.width + GAPS).toBeCloseTo(520 - PADDING, 5);
  });

  it('shrinks the basis item, keeps the one that opted out, and then overflows', () => {
    const ui = mount();
    narrow(ui);
    narrow(ui);

    const { one, fixed, basis } = tiles(ui);

    // flexShrink 0 is not a suggestion: this item is 96 px at 300 px of
    // row as it was at 520, and its siblings give up the space instead.
    expect(fixed.width).toBe(96);
    expect(basis.width).toBeLessThan(140);
    // Nobody shrinks below their own content, so what is left over
    // overflows the row rather than crushing the items into it. The
    // first item starts at the content box's left edge.
    expect(basis.x + basis.width).toBeGreaterThan(one.x + (300 - PADDING));
  });

  it('breaks into lines once flexWrap is on, one rowGap apart', () => {
    const ui = mount();
    narrow(ui);
    narrow(ui);

    const flat = tiles(ui);
    // Not wrapping, so all four are on one line, overflow and all.
    expect([flat.two.y, flat.fixed.y, flat.basis.y]).toEqual([flat.one.y, flat.one.y, flat.one.y]);

    ui.fireEvent.click(ui.getByRole('button', { name: 'Wrap' }));
    ui.frame();

    const wrapped = tiles(ui);
    expect([wrapped.two.y, wrapped.fixed.y]).toEqual([wrapped.one.y, wrapped.one.y]);
    // The last item did not fit, so it starts a line of its own, one
    // `rowGap` below the bottom of the line above it.
    expect(wrapped.basis.y - (wrapped.one.y + wrapped.one.height)).toBeCloseTo(10, 5);
    // A line's items are laid out again in the space that line has, so
    // the item that could not fit is back at its full basis.
    expect(wrapped.basis.width).toBe(140);
  });
});
