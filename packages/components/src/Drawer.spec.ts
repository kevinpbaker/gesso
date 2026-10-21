import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Button, Column, percent, type UiChild, type UiNode } from 'gesso-core';
import { AnimationService, OverlayService, createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Dialog } from './Dialog';
import { Drawer, type DrawerProps } from './Drawer';
import { Menu } from './Menu';

const WIDTH = 800;
const HEIGHT = 600;

/** Far past any slide, so the drawer is at rest. */
let clock = 0;
const settle = (ui: Rendered): void => {
  ui.frame();
  clock += 5000;
  ui.frame(clock);
};

/** The drawer's props, with `open` as the cell the page owns. */
type MountProps = Omit<Partial<DrawerProps>, 'open'> & { open?: BehaviorSubject<boolean> };

/**
 * A page with a button that opens nothing on its own and counts its
 * presses, beside a drawer, in a window of a known size.
 */
function mount(props: MountProps = {}, direction: 'ltr' | 'rtl' = 'ltr') {
  const open = props.open ?? new BehaviorSubject(false);
  const changes: boolean[] = [];
  let closes = 0;
  let presses = 0;
  const ui = renderTest(
    Box(
      { width: percent(100), height: percent(100), textDirection: direction },
      Column(
        { gap: 8 },
        Button({ text: 'Open', label: 'Open', onClick: () => open.next(true) }),
        Button({ text: 'Page', label: 'Page', onClick: () => presses++ })
      ),
      createComponent(Drawer, {
        open,
        title: 'Filters',
        content: Column(Button({ text: 'First', label: 'First' }), Button({ text: 'Second', label: 'Second' })),
        onOpenChange: (next: boolean) => {
          changes.push(next);
          open.next(next);
        },
        onClose: () => closes++,
        ...props
      })
    ),
    { width: WIDTH, height: HEIGHT }
  );
  ui.frame();
  return { ui, open, changes, closes: () => closes, presses: () => presses };
}

/** Opens it the way a reader does: focus the button, then press it. */
function openFrom(ui: Rendered): UiNode {
  const opener = ui.getByLabel('Open');
  ui.fireEvent.focus(opener);
  ui.fireEvent.click(opener);
  settle(ui);
  return opener;
}

const drawer = (ui: Rendered) => ui.getByRole('dialog', { name: 'Filters' });
const entries = (ui: Rendered) => ui.runtime.services.get(OverlayService).entries.value;
const focusedLabel = (ui: Rendered) => ui.runtime.input.focus.focusedNode?.properties.get('label');

describe('Drawer, placed at its edge', () => {
  const cases = [
    { side: 'start', direction: 'ltr', x: 0, y: 0, width: 320, height: HEIGHT },
    { side: 'end', direction: 'ltr', x: WIDTH - 320, y: 0, width: 320, height: HEIGHT },
    { side: 'top', direction: 'ltr', x: 0, y: 0, width: WIDTH, height: 320 },
    { side: 'bottom', direction: 'ltr', x: 0, y: HEIGHT - 320, width: WIDTH, height: 320 },
    // Start and end are reading edges: right to left, they swap.
    { side: 'start', direction: 'rtl', x: WIDTH - 320, y: 0, width: 320, height: HEIGHT },
    { side: 'end', direction: 'rtl', x: 0, y: 0, width: 320, height: HEIGHT }
  ] as const;
  for (const { side, direction, ...box } of cases) {
    it(`sits on its edge for side ${side}, ${direction}`, () => {
      const { ui } = mount({ side }, direction);
      openFrom(ui);
      expect(ui.getLayout(drawer(ui))).toMatchObject(box);
    });
  }

  it('is never wider than the window', () => {
    const { ui } = mount({ size: 1200 });
    openFrom(ui);
    expect(ui.getLayout(drawer(ui)).width).toBe(WIDTH);

    const tall = mount({ side: 'bottom', size: 900 });
    openFrom(tall.ui);
    const box = tall.ui.getLayout(tall.ui.getByRole('dialog', { name: 'Filters' }));
    expect(box.height).toBe(HEIGHT);
    expect(box.y).toBe(0);
  });

  it('lays out its content right to left when it was declared in right-to-left text', () => {
    // The overlay layer carries the theme across but not the direction;
    // a drawer that did not carry it would mirror nothing inside it.
    const { ui } = mount({ content: Box({ width: 40, height: 40, label: 'Mark' }) }, 'rtl');
    openFrom(ui);
    const panel = ui.getLayout(drawer(ui));
    const mark = ui.getLayout(ui.getByLabel('Mark'));
    expect(mark.x + mark.width).toBeGreaterThan(panel.x + panel.width - 40);
  });

  it('scrolls content taller than the window inside itself, the title staying put', () => {
    const { ui } = mount({
      content: Column(
        Box({ height: 500, flexShrink: 0, label: 'Top' }),
        Box({ height: 500, flexShrink: 0, label: 'Bottom' })
      )
    });
    openFrom(ui);
    const panel = ui.getLayout(drawer(ui));
    expect(panel.height).toBe(HEIGHT);
    const heading = ui.getVisibleBox(ui.getByText('Filters'));
    const bottom = () => ui.getVisibleBox(ui.getByLabel('Bottom'));
    expect(bottom().y + bottom().height).toBeGreaterThan(HEIGHT);

    ui.fireEvent.wheel({ x: 100, y: 300, deltaY: 2000 });
    ui.frame();
    expect(ui.getVisibleBox(ui.getByText('Filters'))).toEqual(heading);
    expect(bottom().y + bottom().height).toBeLessThanOrEqual(HEIGHT);
  });
});

describe('Drawer, sliding', () => {
  it('starts beyond its edge and slides into place', () => {
    const { ui, open } = mount();
    open.next(true);
    ui.frame((clock += 16));
    const first = drawer(ui).properties.get('transform') as { translateX: number };
    expect(first.translateX).toBeLessThan(-300);
    settle(ui);
    const rest = drawer(ui).properties.get('transform') as { translateX: number };
    expect(rest.translateX).toBe(0);
  });

  it('comes in from beyond the edge it is on', () => {
    const away = (props: MountProps, direction: 'ltr' | 'rtl' = 'ltr') => {
      const { ui, open } = mount(props, direction);
      open.next(true);
      ui.frame((clock += 16));
      return drawer(ui).properties.get('transform') as { translateX?: number; translateY?: number };
    };
    expect(away({ side: 'end' }).translateX).toBeGreaterThan(300);
    expect(away({ side: 'start' }, 'rtl').translateX).toBeGreaterThan(300);
    expect(away({ side: 'top' }).translateY).toBeLessThan(-300);
    expect(away({ side: 'bottom' }).translateY).toBeGreaterThan(300);
  });

  it('slides out before it goes, taking no presses on the way', () => {
    let pressed = 0;
    const { ui, open } = mount({ content: Button({ text: 'Apply', label: 'Apply', onClick: () => pressed++ }) });
    openFrom(ui);
    const apply = ui.getLayout(ui.getByLabel('Apply'));
    open.next(false);
    ui.frame((clock += 16));
    // Still drawn, on its way out, and inert.
    expect(entries(ui)).toHaveLength(1);
    expect(drawer(ui).properties.get('disabled')).toBe(true);
    ui.fireEvent.pointerDown(apply.x + 4, apply.y + 4);
    ui.fireEvent.pointerUp(apply.x + 4, apply.y + 4);
    expect(pressed).toBe(0);

    settle(ui);
    expect(entries(ui)).toHaveLength(0);
    expect(ui.queryByRole('dialog')).toBeNull();
  });

  it('turns round when it is opened again while sliding out', () => {
    const { ui, open } = mount();
    openFrom(ui);
    open.next(false);
    ui.frame((clock += 16));
    open.next(true);
    settle(ui);
    expect(entries(ui)).toHaveLength(1);
    expect(drawer(ui).properties.get('disabled')).toBe(false);
    expect(ui.runtime.input.focus.trapped).toBe(true);
  });

  it('is simply there, and simply gone, under reduced motion', () => {
    const { ui, open } = mount();
    ui.runtime.services.get(AnimationService).applyReducedMotion(true);
    open.next(true);
    ui.frame();
    const at = drawer(ui).properties.get('transform') as { translateX: number };
    expect(at.translateX).toBe(0);
    // The keyboard still lands on the first control, not on the box.
    expect(focusedLabel(ui)).toBe('Close');
    open.next(false);
    ui.frame();
    expect(entries(ui)).toHaveLength(0);
  });
});

describe('Drawer, modal', () => {
  it('says it is a modal dialog with a name and a description', () => {
    const { ui } = mount({ description: 'Narrow the list' });
    openFrom(ui);
    expect(drawer(ui)).toHaveSemantics({ role: 'dialog', name: 'Filters' });
    const record = ui.getSemantics(drawer(ui));
    expect(record.states).toContain('modal');
    expect(record.description).toBe('Narrow the list');
  });

  it('takes its name from label when there is no title', () => {
    const { ui } = mount({ title: '', label: 'Navigation' });
    openFrom(ui);
    expect(ui.getByRole('dialog', { name: 'Navigation' })).toBeDefined();
  });

  it('traps Tab inside, closes on Escape, and hands the keyboard back', () => {
    const { ui, changes, closes } = mount();
    const opener = openFrom(ui);
    expect(ui.runtime.input.focus.trapped).toBe(true);

    const visited = [focusedLabel(ui)];
    for (let i = 0; i < 3; i++) {
      ui.fireEvent.keyDown('Tab');
      visited.push(focusedLabel(ui));
    }
    // The close button, the two in the body, and round again.
    expect(visited).toEqual(['Close', 'First', 'Second', 'Close']);

    ui.fireEvent.keyDown('Escape');
    // The keyboard is back at once, before the slide has finished.
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
    settle(ui);
    expect(changes).toEqual([false]);
    expect(closes()).toBe(1);
    expect(entries(ui)).toHaveLength(0);
  });

  it('closes on a press on the dimmed page, which presses nothing there', () => {
    const { ui, presses, open } = mount({ side: 'end' });
    openFrom(ui);
    const page = ui.getLayout(ui.getByLabel('Page'));
    ui.fireEvent.pointerDown(page.x + 5, page.y + 5);
    ui.fireEvent.pointerUp(page.x + 5, page.y + 5);
    settle(ui);
    expect(presses()).toBe(0);
    expect(open.value).toBe(false);
  });

  it('closes from its close button', () => {
    const { ui, open } = mount();
    openFrom(ui);
    ui.fireEvent.click(ui.getByLabel('Close'));
    settle(ui);
    expect(open.value).toBe(false);
  });

  it('ignores Escape and the dimmed page, and has no close button, when not dismissible', () => {
    const { ui, open, presses } = mount({ dismissible: false, side: 'end' });
    openFrom(ui);
    expect(ui.queryByLabel('Close')).toBeNull();
    ui.fireEvent.keyDown('Escape');
    const page = ui.getLayout(ui.getByLabel('Page'));
    ui.fireEvent.pointerDown(page.x + 5, page.y + 5);
    ui.fireEvent.pointerUp(page.x + 5, page.y + 5);
    settle(ui);
    expect(open.value).toBe(true);
    expect(presses()).toBe(0);
    expect(entries(ui)).toHaveLength(1);
  });
});

describe('Drawer, not modal', () => {
  it('leaves the page usable, takes focus without a trap, and says it is not modal', () => {
    const { ui, presses } = mount({ modal: false, side: 'end' });
    openFrom(ui);
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.getSemantics(drawer(ui)).states ?? []).not.toContain('modal');
    expect(focusedLabel(ui)).toBe('Filters');

    ui.fireEvent.click(ui.getByLabel('Page'));
    expect(presses()).toBe(1);
    expect(entries(ui)).toHaveLength(1);
  });

  it('closes on Escape while focus is in it, and hands focus back', () => {
    const { ui, open } = mount({ modal: false });
    const opener = openFrom(ui);
    ui.fireEvent.focus(ui.getByLabel('First'));
    ui.fireEvent.keyDown('Escape');
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
    settle(ui);
    expect(open.value).toBe(false);
  });

  it('does not hear Escape once focus has gone back to the page', () => {
    const { ui, open } = mount({ modal: false });
    openFrom(ui);
    ui.fireEvent.focus(ui.getByLabel('Page'));
    ui.fireEvent.keyDown('Escape');
    settle(ui);
    expect(open.value).toBe(true);
  });
});

describe('Drawer, controlled and not', () => {
  it('stays open when the owner does not write open back', () => {
    const changes: boolean[] = [];
    const { ui } = mount({ onOpenChange: (next: boolean) => changes.push(next) });
    openFrom(ui);
    ui.fireEvent.keyDown('Escape');
    settle(ui);
    expect(changes).toEqual([false]);
    expect(entries(ui)).toHaveLength(1);
  });

  it('owns its state with defaultOpen, and still reports the change', () => {
    const changes: boolean[] = [];
    const ui = renderTest(
      createComponent(Drawer, {
        defaultOpen: true,
        title: 'Filters',
        onOpenChange: (next: boolean) => changes.push(next)
      }),
      { width: WIDTH, height: HEIGHT }
    );
    settle(ui);
    expect(ui.getByRole('dialog', { name: 'Filters' })).toBeDefined();
    ui.fireEvent.keyDown('Escape');
    settle(ui);
    expect(changes).toEqual([false]);
    expect(ui.queryByRole('dialog')).toBeNull();
  });

  it('refuses both open and defaultOpen', () => {
    expect(() =>
      renderTest(createComponent(Drawer, { open: true, defaultOpen: true }), { width: WIDTH, height: HEIGHT })
    ).toThrow(/both 'open' and 'defaultOpen'/);
  });

  it('does not report a close when it goes because it unmounted', () => {
    const shown = new BehaviorSubject<UiChild[]>([]);
    const changes: boolean[] = [];
    const ui = renderTest(Box({ width: percent(100), height: percent(100) }, shown), {
      width: WIDTH,
      height: HEIGHT
    });
    shown.next([createComponent(Drawer, { open: true, title: 'Filters', onOpenChange: n => changes.push(n) })]);
    settle(ui);
    expect(entries(ui)).toHaveLength(1);
    shown.next([]);
    settle(ui);
    expect(entries(ui)).toHaveLength(0);
    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe('Drawer, among other overlays', () => {
  it('opened from inside a dialog, gives the keyboard back to the dialog', () => {
    const dialog = new BehaviorSubject(true);
    const drawerOpen = new BehaviorSubject(false);
    const ui = renderTest(
      Column(
        createComponent(Dialog, {
          open: dialog,
          title: 'Settings',
          content: Button({ text: 'More', label: 'More', onClick: () => drawerOpen.next(true) })
        }),
        createComponent(Drawer, {
          open: drawerOpen,
          title: 'More settings',
          content: Button({ text: 'Inner', label: 'Inner' }),
          onOpenChange: (next: boolean) => drawerOpen.next(next)
        })
      ),
      { width: WIDTH, height: HEIGHT }
    );
    settle(ui);
    const more = ui.getByLabel('More');
    ui.fireEvent.focus(more);
    ui.fireEvent.click(more);
    settle(ui);
    expect(ui.getByRole('dialog', { name: 'More settings' })).toBeDefined();

    // Escape closes the drawer and not the dialog under it.
    ui.fireEvent.keyDown('Escape');
    settle(ui);
    expect(drawerOpen.value).toBe(false);
    expect(dialog.value).toBe(true);
    expect(ui.runtime.input.focus.focusedNode).toBe(more);
    expect(ui.runtime.input.focus.trapped).toBe(true);
  });

  it('closed by its owner under an open menu, leaves the menu holding the keyboard', () => {
    const drawerOpen = new BehaviorSubject(true);
    const menu = new BehaviorSubject(false);
    const ui = renderTest(
      Column(
        createComponent(Drawer, { open: drawerOpen, title: 'Filters', content: Button({ text: 'a', label: 'a' }) }),
        createComponent(Menu, {
          open: menu,
          at: { x: 20, y: 20 },
          items: [{ value: 'copy', label: 'Copy' }],
          onOpenChange: (next: boolean) => menu.next(next)
        })
      ),
      { width: WIDTH, height: HEIGHT }
    );
    settle(ui);
    menu.next(true);
    ui.frame();
    drawerOpen.next(false);
    settle(ui);
    const inMenu = () => {
      for (let at = ui.runtime.input.focus.focusedNode; at !== null; at = at.parent) {
        if (at === ui.getByRole('menu')) return true;
      }
      return false;
    };
    expect(ui.runtime.input.focus.trapped).toBe(true);
    expect(inMenu()).toBe(true);
  });
});
