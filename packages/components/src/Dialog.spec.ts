import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  Box,
  Button,
  Column,
  colorToCss,
  darkColors,
  darkTheme,
  lightColors,
  lightTheme,
  percent,
  ScrollView,
  type UiNode
} from 'gesso-core';
import { AnimationService, createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { Dialog } from './Dialog';
import { Menu } from './Menu';

describe('Dialog on a narrow screen', () => {
  it('fits a dialog wider than the screen inside it, with a margin each side', () => {
    // `width` was the dialog's width whatever the screen: a 520 px
    // dialog on a 375 px phone ran off both sides, title and all.
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 375, height: 700 },
        createComponent(Dialog, { open, title: 'Keyboard shortcuts', width: 520, content: Box({ height: 10 }) })
      ),
      { width: 375, height: 700 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    expect(dialog.x).toBe(16);
    expect(dialog.width).toBe(375 - 2 * 16);

    // Where there's room, it's the width it asked for, centred.
    ui.runtime.resize(1000, 700);
    ui.frame();
    const wide = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    expect(wide.width).toBe(520);
    expect(wide.x).toBe((1000 - 520) / 2);
  });
});

describe('Dialog on a short screen', () => {
  /** Two blocks that keep their height, 600 pixels of body in all. */
  const tall = () =>
    Column(
      { width: percent(100) },
      Box({ height: 300, flexShrink: 0, label: 'First' }),
      Box({ height: 300, flexShrink: 0, label: 'Last' })
    );

  it('fits a dialog taller than the screen inside it, scrolling the body under the title', () => {
    // A dialog's height was its content's whatever the screen: centred,
    // the New issue form on a 500 px window ran off the top and the
    // bottom, title and buttons with it.
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 375, height: 500 },
        createComponent(Dialog, { open, title: 'New issue', width: 600, content: tall() })
      ),
      { width: 375, height: 500 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'New issue' }));
    expect(dialog.y).toBe(16);
    expect(dialog.height).toBe(500 - 2 * 16);

    // The title stays put while the body scrolls under it.
    const title = () => ui.getVisibleBox(ui.getByText('New issue'));
    const last = () => ui.getVisibleBox(ui.getByLabel('Last'));
    const before = title();
    expect(before.y).toBeGreaterThanOrEqual(dialog.y);
    expect(last().y + last().height).toBeGreaterThan(dialog.y + dialog.height);
    // Once it has faded in: a dialog at opacity 0 takes no input.
    ui.frame(1000);
    ui.fireEvent.wheel({ x: 187, y: 300, deltaY: 1000 });
    ui.frame();
    expect(title()).toEqual(before);
    // Scrolled to the end, the last block's bottom is inside the dialog's padding.
    expect(last().y + last().height).toBe(dialog.y + dialog.height - 20);

    // The body clips, so it keeps 4 pixels of its own round the content:
    // room for the focus ring drawn outside a field at its edge. The
    // content still starts 20 pixels in from the dialog's side.
    const content = ui.getLayout(ui.getByLabel('First').parent!);
    const body = ui.getLayout(ui.getByLabel('First').parent!.parent!);
    expect(content.x - body.x).toBe(4);
    expect(content.x - dialog.x).toBe(20);

    // Where there's room, it's its content's height, centred.
    ui.runtime.resize(375, 1000);
    ui.frame();
    const roomy = ui.getLayout(ui.getByRole('dialog', { name: 'New issue' }));
    expect(roomy.height).toBeLessThan(1000 - 2 * 16);
    expect(roomy.y).toBeCloseTo((1000 - roomy.height) / 2, 5);
  });

  it('gives content that can shrink the room there is, instead of scrolling it', () => {
    // A list with a height of its own, which may shrink: it gets what's
    // left under the title and the field above it, and scrolls itself,
    // so the field stays in view.
    const open = new BehaviorSubject(false);
    const content = Column(
      { width: percent(100), gap: 12, minHeight: 0 },
      Box({ height: 40, label: 'Filter' }),
      ScrollView({ height: 420, minHeight: 0, label: 'List' }, Column(Box({ height: 1000 })))
    );
    const ui = renderTest(
      Box(
        { width: 375, height: 400 },
        createComponent(Dialog, { open, title: 'Keyboard shortcuts', width: 520, content })
      ),
      { width: 375, height: 400 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    const list = ui.getLayout(ui.getByLabel('List'));
    expect(dialog.height).toBe(400 - 2 * 16);
    expect(list.y + list.height).toBe(dialog.y + dialog.height - 20);
    expect(list.height).toBeLessThan(420);

    // With room for all of it, the list is the height it asked for.
    ui.runtime.resize(375, 800);
    ui.frame();
    expect(ui.getLayout(ui.getByLabel('List')).height).toBe(420);
  });
});

describe('Dialog over the page', () => {
  /** A panel in a corner of the page, lifted by a zIndex, with a button that counts its presses. */
  function page(open: BehaviorSubject<boolean>, dismissible: boolean) {
    let presses = 0;
    const ui = renderTest(
      Column(
        { width: percent(100), height: percent(100) },
        Box(
          { position: 'absolute', right: 0, bottom: 0, width: 200, height: 120, zIndex: 5000, label: 'Tour' },
          Button({ text: 'Next', label: 'Next', width: percent(100), height: percent(100), onClick: () => presses++ })
        ),
        createComponent(Dialog, {
          open,
          title: 'Working',
          width: 360,
          dismissible,
          content: Box({ height: 300 }),
          onClose: () => open.next(false)
        })
      ),
      { width: 375, height: 500 }
    );
    open.next(true);
    // Past the entrance: a dialog at opacity 0 takes no presses.
    ui.frame();
    ui.frame(1000);
    return { ui, presses: () => presses };
  }

  /** A press and release at a point, through hit testing, as a pointer makes one. */
  function pressAt(ui: ReturnType<typeof renderTest>, x: number, y: number): void {
    ui.fireEvent.pointerDown(x, y);
    ui.fireEvent.pointerUp(x, y);
    ui.frame();
  }

  for (const dismissible of [true, false]) {
    it(`covers a positioned panel with a zIndex, and takes its presses, when ${dismissible ? '' : 'not '}dismissible`, () => {
      const open = new BehaviorSubject(false);
      const { ui, presses } = page(open, dismissible);
      const next = ui.getLayout(ui.getByLabel('Next'));
      const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'Working' }));
      // The panel shows below the dialog, beside nothing but the backdrop.
      const x = next.x + next.width / 2;
      const y = next.y + next.height - 5;
      expect(y).toBeGreaterThan(dialog.y + dialog.height);

      // Painted under the dialog: its label is drawn before the title.
      const texts = ui.draws.filter(call => call.name === 'fillText').map(call => call.args[0]);
      expect(texts.lastIndexOf('Next')).toBeLessThan(texts.lastIndexOf('Working'));

      // And pressed under it: the press is the backdrop's, never the
      // panel's. A dialog that can't be dismissed had no backdrop, so the
      // panel's button took the press through the modal.
      pressAt(ui, x, y);
      expect(presses()).toBe(0);
      expect(open.value).toBe(!dismissible);
    });
  }
});

describe("Dialog's scrim", () => {
  /** The box in the overlay layer painted with the theme's scrim, if there is one. */
  function scrimOf(root: UiNode): UiNode | undefined {
    const stack: UiNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.properties.get('backgroundColor') === 'scrim') return node;
      for (let child = node.firstChild; child !== null; child = child.nextSibling) stack.push(child);
    }
    return undefined;
  }
  function mount(props: { scrim?: boolean } = {}, theme = lightTheme) {
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 400, height: 300, theme },
        createComponent(Dialog, { open, title: 'Rename', content: Box({ height: 10 }), ...props })
      ),
      { width: 400, height: 300 }
    );
    return { ui, open, scrim: () => scrimOf(ui.runtime.layoutRoot()) };
  }
  /** Every colour a frame filled with. */
  function fills(ui: ReturnType<typeof renderTest>): string[] {
    ui.clearDraws();
    ui.runtime.resize(400, 301);
    ui.frame();
    return ui.draws.filter(call => call.name === 'set:fillStyle').map(call => String(call.args[0]));
  }

  it('dims the page behind it with the theme scrim, fading in with the dialog', () => {
    const { ui, open, scrim } = mount();
    expect(scrim()).toBeUndefined();
    open.next(true);
    ui.frame();
    expect(scrim()!.properties.get('opacity')).toBeLessThan(0.5);
    ui.frame(10_000);
    // At rest, the motion lets go of the opacity.
    expect(scrim()!.properties.get('opacity')).toBeUndefined();
    expect(fills(ui)).toContain(colorToCss(lightColors.scrim));
    open.next(false);
    ui.frame();
    expect(scrim()).toBeUndefined();
  });

  it("is the palette's the dialog was opened in", () => {
    const { ui, open } = mount({}, darkTheme);
    open.next(true);
    ui.frame(10_000);
    expect(fills(ui)).toContain(colorToCss(darkColors.scrim));
  });

  it("is the palette's it was declared in when it is open from the moment it mounts", () => {
    // Opened before its placeholder existed, it once inherited no theme
    // and drew in the light palette over a dark page.
    const ui = renderTest(
      Box(
        { width: 400, height: 300, theme: darkTheme },
        createComponent(Dialog, { open: new BehaviorSubject(true), title: 'Guide', content: Box({ height: 10 }) })
      ),
      { width: 400, height: 300 }
    );
    ui.frame(10_000);
    const drawn = fills(ui);
    expect(drawn).toContain(colorToCss(darkColors.scrim));
    expect(drawn).not.toContain(colorToCss(lightColors.scrim));
  });

  it('draws a menu made already open, at a point, in the palette it was declared in', () => {
    // A right-click's menu, declared as it opens: its placeholder was
    // not in the tree yet, and it opened in the root's light palette
    // over a dark page.
    const ui = renderTest(
      Box(
        { width: 400, height: 300, theme: darkTheme },
        createComponent(Menu, {
          open: new BehaviorSubject(true),
          at: { x: 40, y: 40 },
          items: [{ value: 'delete', label: 'Delete' }]
        })
      ),
      { width: 400, height: 300 }
    );
    ui.frame();
    const drawn = fills(ui);
    expect(drawn).toContain(colorToCss(darkColors.surface));
    expect(drawn).not.toContain(colorToCss(lightColors.surface));
  });

  it('is there at once under reduced motion', () => {
    const { ui, open, scrim } = mount();
    ui.runtime.services.get(AnimationService).applyReducedMotion(true);
    open.next(true);
    ui.frame();
    expect(scrim()!.properties.get('opacity') ?? 1).toBe(1);
  });

  it('is left off with scrim={false}, and the page is still kept from presses', () => {
    const pressed: string[] = [];
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 400, height: 300, onPointerDown: () => pressed.push('page') },
        createComponent(Dialog, {
          open,
          title: 'Rename',
          scrim: false,
          dismissible: false,
          content: Box({ height: 10 })
        })
      ),
      { width: 400, height: 300 }
    );
    open.next(true);
    ui.frame(10_000);
    expect(scrimOf(ui.runtime.layoutRoot())).toBeUndefined();
    ui.fireEvent.pointerDown(5, 5);
    ui.fireEvent.pointerUp(5, 5);
    expect(pressed).toEqual([]);
  });
});

describe('Dialog closed from code under something open over it', () => {
  // A dialog released "the innermost trap", whoever had taken it. Closed
  // by its owner while a menu or a second dialog sat over it — a timer,
  // a save that finished — it ended that one's trap instead of its own,
  // and the keyboard left the window still open on top.
  const focusedLabel = (ui: ReturnType<typeof renderTest>) =>
    ui.runtime.input.focus.focusedNode?.properties.get('label');

  it('leaves a second dialog over it trapping the keyboard', () => {
    const outer = new BehaviorSubject(true);
    const inner = new BehaviorSubject(false);
    const ui = renderTest(
      Column(
        Button({ text: 'Page', label: 'Page' }),
        createComponent(Dialog, { open: outer, title: 'Outer', content: Button({ text: 'a', label: 'a' }) }),
        createComponent(Dialog, {
          open: inner,
          title: 'Inner',
          content: Column(Button({ text: 'b', label: 'b' }), Button({ text: 'c', label: 'c' }))
        })
      ),
      { width: 400, height: 400 }
    );
    ui.frame();
    inner.next(true);
    ui.frame();
    expect(focusedLabel(ui)).toBe('b');

    outer.next(false);
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(true);
    expect(focusedLabel(ui)).toBe('b');
    ui.fireEvent.keyDown('Tab');
    ui.fireEvent.keyDown('Tab');
    expect(focusedLabel(ui)).toBe('b');
  });

  it('leaves a menu over it trapping the keyboard', () => {
    const dialog = new BehaviorSubject(true);
    const menu = new BehaviorSubject(false);
    const ui = renderTest(
      Column(
        Button({ text: 'Page', label: 'Page' }),
        createComponent(Dialog, { open: dialog, title: 'Outer', content: Button({ text: 'a', label: 'a' }) }),
        createComponent(Menu, {
          open: menu,
          at: { x: 20, y: 20 },
          items: [{ value: 'copy', label: 'Copy' }],
          onOpenChange: (next: boolean) => menu.next(next)
        })
      ),
      { width: 400, height: 400 }
    );
    ui.frame();
    menu.next(true);
    ui.frame();
    const inMenu = () => {
      for (let at = ui.runtime.input.focus.focusedNode; at !== null; at = at.parent) {
        if (at === ui.getByRole('menu')) return true;
      }
      return false;
    };
    expect(inMenu()).toBe(true);

    dialog.next(false);
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(true);
    expect(inMenu()).toBe(true);
    // Escape still reaches the menu, and closing it then hands the keyboard back.
    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(menu.value).toBe(false);
    expect(ui.runtime.input.focus.trapped).toBe(false);
  });

  it('hands the keyboard back to its opener when it goes with a menu of its own open', () => {
    // The workbench's self-closing dialog: a timer closes it while the
    // menu inside it is open, and both go.
    const dialog = new BehaviorSubject(false);
    const menu = new BehaviorSubject(false);
    const anchor = new BehaviorSubject<UiNode | null>(null);
    const ui = renderTest(
      Column(
        Button({ text: 'Open', label: 'Open' }),
        Button({ text: 'After', label: 'After' }),
        createComponent(Dialog, {
          open: dialog,
          title: 'Going away',
          content: Column(
            Button({ text: 'Menu', label: 'Menu', ref: (node: UiNode | null) => anchor.next(node) }),
            createComponent(Menu, {
              open: menu,
              anchor,
              items: [{ value: 'copy', label: 'Copy' }],
              onOpenChange: (next: boolean) => menu.next(next)
            })
          )
        })
      ),
      { width: 400, height: 400 }
    );
    const opener = ui.getByLabel('Open');
    ui.fireEvent.focus(opener);
    dialog.next(true);
    ui.frame();
    menu.next(true);
    ui.frame();

    dialog.next(false);
    ui.frame();

    expect(ui.runtime.input.focus.trapped).toBe(false);
    expect(ui.runtime.input.focus.focusedNode).toBe(opener);
    ui.fireEvent.keyDown('Tab');
    expect(focusedLabel(ui)).toBe('After');
  });
});

describe('Dialog taking the keyboard as it opens', () => {
  // The dialog's box is focusable, as the home of last resort, and the
  // trap is taken from its ref, before its children exist. Focus has to
  // settle on the first control once they do, not on the box, and that
  // must not depend on the entrance: under reduced motion the box is
  // visible from its first frame, which was suspected of letting it
  // keep focus. It does not; these pin it.
  function opened(reduced: boolean) {
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Column(
        Button({ text: 'Page', label: 'Page' }),
        createComponent(Dialog, {
          open,
          title: 'Rename',
          content: Column(Button({ text: 'a', label: 'a' }), Button({ text: 'b', label: 'b' }))
        })
      ),
      { width: 400, height: 400 }
    );
    ui.runtime.services.get(AnimationService).applyReducedMotion(reduced);
    ui.frame();
    open.next(true);
    ui.frame();
    ui.frame(10_000);
    return ui.runtime.input.focus.focusedNode?.properties.get('label');
  }

  it('puts focus on its first control', () => {
    expect(opened(false)).toBe('a');
  });

  it('puts focus on its first control under reduced motion too', () => {
    expect(opened(true)).toBe('a');
  });
});
