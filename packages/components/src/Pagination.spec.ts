import { describe, expect, it, vi } from 'vitest';

import { createComponent, internalState, type ComponentProps } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiChild, type UiNode } from 'gesso-core';

import { Pagination, paginationItems, type PaginationItem } from './Pagination';

/**
 * A strip in a window wide enough for eleven slots, so nothing wraps
 * and every assertion about a control is about the control rather than
 * about the box it was squeezed into.
 */
function mount(props: Partial<ComponentProps<typeof Pagination>>) {
  const strip: UiChild = createComponent(Pagination, { pageCount: 10, ...props });
  return renderTest(Column({ padding: 8, x: 'start', width: 640, height: 120 }, strip), { width: 640, height: 120 });
}

/** Every page button's accessible name, in the order the strip draws them. */
function names(ui: ReturnType<typeof mount>): string[] {
  return ui.getAllByRole('button').map(node => ui.getSemantics(node).label ?? '');
}

/** Every glyph drawn anywhere in the strip, in order. */
function drawn(ui: ReturnType<typeof mount>): string[] {
  return ui.textOf();
}

function selected(ui: ReturnType<typeof mount>): UiNode[] {
  return ui.getAllByRole('button').filter(node => (ui.getSemantics(node).states ?? []).includes('selected'));
}

/**
 * The arithmetic, as a table.
 *
 * This is the component. Everything below it is a tree; this is the
 * decision, and it is a pure function precisely so that the dozen
 * cases that are hard to get right can be read side by side rather
 * than inferred from a dozen mounted strips.
 */
describe('paginationItems', () => {
  const cases: readonly {
    readonly name: string;
    readonly shape: Parameters<typeof paginationItems>[0];
    readonly items: readonly PaginationItem[];
  }[] = [
    // The default shape, walked from one end to the other. Count the
    // slots between 'previous' and 'next' in each of these: seven,
    // every time. That is the fixed width, and it is the reason the
    // next button does not move out from under a pointer pressing it.
    {
      name: 'page 1 of 10 draws the run at full width against the left edge',
      shape: { page: 1, pageCount: 10 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 10, 'next']
    },
    {
      name: 'page 3 of 10 draws exactly what page 1 does, so nothing moved getting here',
      shape: { page: 3, pageCount: 10 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 10, 'next']
    },
    {
      name: 'page 5 of 10 elides on both sides',
      shape: { page: 5, pageCount: 10 },
      items: ['previous', 1, 'gapBefore', 4, 5, 6, 'gapAfter', 10, 'next']
    },
    {
      name: 'page 10 of 10 is the mirror of page 1, at the same width',
      shape: { page: 10, pageCount: 10 },
      items: ['previous', 1, 'gapBefore', 6, 7, 8, 9, 10, 'next']
    },

    // The case this component exists to get right. In each of these an
    // ellipsis would have stood for exactly one page, and a page is
    // the same width as an ellipsis and can be pressed.
    {
      name: 'draws page 2 rather than an ellipsis standing only for page 2',
      shape: { page: 1, pageCount: 10 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 10, 'next']
    },
    {
      name: 'draws page 9 rather than an ellipsis standing only for page 9',
      shape: { page: 9, pageCount: 10 },
      items: ['previous', 1, 'gapBefore', 6, 7, 8, 9, 10, 'next']
    },
    {
      name: 'elides two pages, which is the first count worth eliding',
      shape: { page: 1, pageCount: 8 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 8, 'next']
    },
    {
      name: 'never elides when every page fits',
      shape: { page: 4, pageCount: 7 },
      items: ['previous', 1, 2, 3, 4, 5, 6, 7, 'next']
    },

    // The other three dials.
    {
      name: 'siblings 0 keeps one page in the middle and still holds its width',
      shape: { page: 5, pageCount: 10, siblings: 0 },
      items: ['previous', 1, 'gapBefore', 5, 'gapAfter', 10, 'next']
    },
    {
      name: 'siblings 0 at the left end spends the saved slot on the right',
      shape: { page: 1, pageCount: 10, siblings: 0 },
      items: ['previous', 1, 2, 3, 'gapAfter', 10, 'next']
    },
    {
      name: 'siblings 2 widens the run and keeps the elisions honest',
      shape: { page: 5, pageCount: 10, siblings: 2 },
      items: ['previous', 1, 2, 3, 4, 5, 6, 7, 'gapAfter', 10, 'next']
    },
    {
      name: 'boundaries false drops the pinned first and last, and keeps the elisions',
      shape: { page: 5, pageCount: 10, boundaries: false },
      items: ['previous', 'gapBefore', 4, 5, 6, 'gapAfter', 'next']
    },
    {
      name: 'boundaries false at the left end is the same width as in the middle',
      shape: { page: 1, pageCount: 10, boundaries: false },
      items: ['previous', 1, 2, 3, 4, 'gapAfter', 'next']
    },
    {
      name: 'boundaries false at the right end is too',
      shape: { page: 10, pageCount: 10, boundaries: false },
      items: ['previous', 'gapBefore', 7, 8, 9, 10, 'next']
    },

    // The ends of the range.
    {
      name: 'one page is a set of one: the strip is drawn, with both ends to be disabled',
      shape: { page: 1, pageCount: 1 },
      items: ['previous', 1, 'next']
    },
    {
      name: 'three pages need no arithmetic at all',
      shape: { page: 2, pageCount: 3 },
      items: ['previous', 1, 2, 3, 'next']
    },
    { name: 'no pages draws nothing', shape: { page: 1, pageCount: 0 }, items: [] },
    { name: 'a negative pageCount draws nothing', shape: { page: 1, pageCount: -3 }, items: [] },

    // Out of range clamps for drawing. Whether it also emits is the
    // mounted test below; here it only has to draw something sane.
    {
      name: 'a page past the end draws the last page',
      shape: { page: 99, pageCount: 10 },
      items: ['previous', 1, 'gapBefore', 6, 7, 8, 9, 10, 'next']
    },
    {
      name: 'a page below the start draws the first',
      shape: { page: 0, pageCount: 10 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 10, 'next']
    },
    {
      name: 'a page that is not a number draws the first',
      shape: { page: Number.NaN, pageCount: 10 },
      items: ['previous', 1, 2, 3, 4, 5, 'gapAfter', 10, 'next']
    }
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(paginationItems(entry.shape)).toEqual(entry.items);
    });
  }

  it('holds its width all the way across a set, whatever the dials say', () => {
    for (const siblings of [0, 1, 2]) {
      for (const boundaries of [true, false]) {
        const widths = new Set<number>();
        for (let page = 1; page <= 20; page++) {
          widths.add(paginationItems({ page, pageCount: 20, siblings, boundaries }).length);
        }
        // One width for the whole walk: the strip never reflows under
        // the person paging through it.
        expect(widths.size, `siblings ${siblings}, boundaries ${boundaries}`).toBe(1);
      }
    }
  });

  it('never draws the same page twice, which is what keyed reuse needs', () => {
    for (let pageCount = 1; pageCount <= 24; pageCount++) {
      for (let page = 1; page <= pageCount; page++) {
        for (const siblings of [0, 1, 3]) {
          const pages = paginationItems({ page, pageCount, siblings }).filter(item => typeof item === 'number');
          expect(new Set(pages).size, `page ${page} of ${pageCount}, siblings ${siblings}`).toBe(pages.length);
        }
      }
    }
  });

  it('always offers the page the person is on', () => {
    for (let pageCount = 1; pageCount <= 24; pageCount++) {
      for (let page = 1; page <= pageCount; page++) {
        expect(paginationItems({ page, pageCount })).toContain(page);
      }
    }
  });
});

describe('Pagination', () => {
  it('names every numbered control with a sentence and draws it as a numeral', () => {
    const ui = mount({ defaultPage: 5 });

    expect(names(ui)).toEqual(['Previous page', 'Page 1', 'Page 4', 'Page 5', 'Page 6', 'Page 10', 'Next page']);
    // What a reader hears and what the screen shows are different
    // strings on purpose: "5" in a row of numerals says nothing.
    expect(drawn(ui)).toEqual(['‹', '1', '…', '4', '5', '6', '…', '10', '›']);
  });

  it('marks the page you are on as selected, and only that one', () => {
    const ui = mount({ defaultPage: 5 });

    const chosen = selected(ui);
    expect(chosen).toHaveLength(1);
    expect(ui.getSemantics(chosen[0]).label).toBe('Page 5');
    // Selected, not disabled: the page you are on stays a tab stop.
    expect(ui.getSemantics(chosen[0]).disabled).not.toBe(true);
  });

  it('disables the ends rather than removing them, so the strip keeps its shape', () => {
    const first = mount({ defaultPage: 1 });
    expect(first.getSemantics(first.getByRole('button', { name: 'Previous page' })).disabled).toBe(true);
    expect(first.getSemantics(first.getByRole('button', { name: 'Next page' })).disabled).not.toBe(true);

    const last = mount({ defaultPage: 10 });
    expect(last.getSemantics(last.getByRole('button', { name: 'Previous page' })).disabled).not.toBe(true);
    expect(last.getSemantics(last.getByRole('button', { name: 'Next page' })).disabled).toBe(true);

    // A single page is still a strip, with nowhere to go from it.
    const only = mount({ pageCount: 1 });
    expect(only.getSemantics(only.getByRole('button', { name: 'Previous page' })).disabled).toBe(true);
    expect(only.getSemantics(only.getByRole('button', { name: 'Next page' })).disabled).toBe(true);
  });

  it('leaves the elision out of reach: not a control, and not focusable', () => {
    const ui = mount({ defaultPage: 5 });

    expect(ui.queryByRole('button', { name: '…' })).toBeNull();
    const gaps = ui.getAllByText('…');
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) {
      expect(gap.properties.get('focusable')).not.toBe(true);
      expect(gap.properties.get('hitTestable')).toBe(false);
    }
  });

  it('is a named landmark, because an unnamed one is a line in a list saying nothing', () => {
    expect(mount({}).getByRole('navigation')).toHaveSemantics({ role: 'navigation', name: 'Pagination' });
    expect(mount({ label: 'Search results' }).getByRole('navigation')).toHaveSemantics({ name: 'Search results' });
  });

  it('draws nothing at all, landmark included, when there is no set to page', () => {
    const ui = mount({ pageCount: 0 });

    expect(ui.queryByRole('navigation')).toBeNull();
    expect(ui.queryByRole('button')).toBeNull();
  });

  it('lets the app own the page, and does not move itself', () => {
    const changed = vi.fn();
    const ui = mount({ page: 3, onChange: changed });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next page' }));
    ui.frame();

    expect(changed).toHaveBeenCalledWith(4);
    // Controlled: the strip shows what it was given until it is given
    // something else.
    expect(ui.getSemantics(selected(ui)[0]).label).toBe('Page 3');
  });

  it('follows a controlled page as the app moves it', () => {
    const page = internalState(3);
    const ui = mount({ page, onChange: (next: number) => (page.value = next) });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next page' }));
    ui.frame();
    expect(ui.getSemantics(selected(ui)[0]).label).toBe('Page 4');

    ui.fireEvent.click(ui.getByRole('button', { name: 'Page 10' }));
    ui.frame();
    expect(ui.getSemantics(selected(ui)[0]).label).toBe('Page 10');
    expect(page.value).toBe(10);
  });

  it('owns the page itself when given only a starting one, and still reports', () => {
    const changed = vi.fn();
    const ui = mount({ defaultPage: 2, onChange: changed });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Next page' }));
    ui.frame();

    expect(changed).toHaveBeenCalledWith(3);
    expect(ui.getSemantics(selected(ui)[0]).label).toBe('Page 3');
  });

  it('refuses to be owned twice', () => {
    expect(() => mount({ page: 2, defaultPage: 3 })).toThrow(/both 'page' and 'defaultPage'/);
  });

  it('clamps a page outside the set without reporting a move nobody made', () => {
    const changed = vi.fn();
    const ui = mount({ page: 99, onChange: changed });

    expect(ui.getSemantics(selected(ui)[0]).label).toBe('Page 10');
    expect(changed).not.toHaveBeenCalled();

    // And it steps from where it is drawn, not from where it was told.
    ui.fireEvent.click(ui.getByRole('button', { name: 'Previous page' }));
    ui.frame();
    expect(changed).toHaveBeenCalledWith(9);
  });

  it('says nothing when the press does not move the page', () => {
    const changed = vi.fn();
    const ui = mount({ page: 5, onChange: changed });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Page 5' }));
    ui.frame();

    expect(changed).not.toHaveBeenCalled();
  });

  it('goes quiet as a whole when it is disabled', () => {
    const changed = vi.fn();
    const ui = mount({ defaultPage: 5, disabled: true, onChange: changed });

    for (const node of ui.getAllByRole('button')) {
      expect(ui.getSemantics(node).disabled).toBe(true);
    }
    ui.fireEvent.click(ui.getByRole('button', { name: 'Next page' }));
    ui.frame();
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps the control that was pressed, so the keyboard does not lose its place', () => {
    const page = internalState(4);
    const ui = mount({ page, onChange: (next: number) => (page.value = next) });

    const before = ui.getByRole('button', { name: 'Page 5' });
    ui.fireEvent.click(before);
    ui.frame();

    // The same node, not a new one that happens to say the same thing:
    // a rebuilt element is a destroyed node, and a destroyed node is
    // focus on the floor for whoever just pressed Enter on it.
    expect(ui.getByRole('button', { name: 'Page 5' })).toBe(before);
    expect(ui.getByRole('button', { name: 'Next page' })).toBe(
      ui.getAllByRole('button')[ui.getAllByRole('button').length - 1]
    );
  });

  it('paints in palette names and in the size it was given', () => {
    const ui = mount({ defaultPage: 5 });

    const current = selected(ui)[0];
    const other = ui.getByRole('button', { name: 'Page 4' });
    // The rows of the shared button table, not colours invented here,
    // so a theme that restyles its buttons restyles these with them.
    expect(current.properties.get('backgroundColor')).toBe('controlAccent');
    expect(other.properties.get('backgroundColor')).toBe('transparent');

    // Every numbered slot the same width, so "9" and "10" sit in the
    // same place and an elision fills the slot it replaced.
    const numbered = ui
      .getAllByRole('button')
      .filter(node => (ui.getSemantics(node).label ?? '').startsWith('Page '))
      .map(node => ui.getLayout(node).width);
    expect(new Set(numbered).size).toBe(1);
    // And the elision fills exactly that slot, so swapping a number
    // for a gap moves nothing beside it.
    expect(ui.getLayout(ui.getAllByText('…')[0]).width).toBe(numbered[0]);
  });

  it('holds the slot width at every size, so the floor is a floor', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const ui = mount({ defaultPage: 5, size });
      const numbered = ui
        .getAllByRole('button')
        .filter(node => (ui.getSemantics(node).label ?? '').startsWith('Page '))
        .map(node => ui.getLayout(node).width);
      // Four slots, one of them two digits wide, all the same box.
      expect(new Set(numbered).size, size).toBe(1);
    }
  });

  it('passes the caller its layout props', () => {
    const ui = mount({ defaultPage: 1, marginLeft: 12 });
    expect(ui.getByRole('navigation').properties.get('marginLeft')).toBe(12);
  });
});
