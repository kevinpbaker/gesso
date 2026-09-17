import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import { darkTheme, interactive, withThemeExtension, type UiModifier, type UiNode, type UiTheme } from '@gesso/core';
import { createComponent, type ComponentContext, type Inputs } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { holdToConfirm, holdToConfirmTokens, type HoldToConfirmArgs } from './holdToConfirm';
// The file as text, for the test about what it imports.
import source from './holdToConfirm.ts?raw';

const SIZE = { width: 400, height: 200 };
const LABEL = 'Hold to delete';

interface FixtureOptions {
  /** The modifiers on the element, asked for on every render. */
  readonly modifiers: () => readonly UiModifier[];
  /** Bumped from the test to re-render the element. */
  readonly renders: BehaviorSubject<number>;
  readonly theme?: UiTheme;
}

/**
 * One element carrying the modifiers under test, re-rendered on demand
 * so that a change of arguments can be made while a hold is in flight.
 *
 * A component made per mount, closing over the test's own subject,
 * rather than one taking the subject as a prop: an Observable prop is
 * unwrapped to its current value by the time the body sees it.
 */
function fixture({ modifiers, renders, theme }: FixtureOptions) {
  return function Fixture(_inputs: Inputs<{}>, _ctx: ComponentContext) {
    return (
      <box theme={theme} padding={20} width={SIZE.width} height={SIZE.height}>
        {renders.pipe(
          map(() => (
            <box
              modifiers={modifiers()}
              width={200}
              height={48}
              x="center"
              y="center"
              borderWidth={1}
              borderColor="controlBorder"
              backgroundColor="controlBackground">
              <text text={LABEL} fontSize={12} color="text" />
            </box>
          ))
        )}
      </box>
    );
  };
}

interface Harness {
  readonly ui: Rendered;
  readonly node: UiNode;
  /** The middle of the element, where the pointer goes. */
  readonly at: { x: number; y: number };
  readonly confirmed: number[];
  readonly cancelled: number[];
  readonly rerender: () => void;
}

function mount(
  options: {
    args?: Partial<HoldToConfirmArgs>;
    before?: readonly UiModifier[];
    theme?: UiTheme;
    /** Replaces the whole list, for a test about the arguments themselves. */
    modifiers?: () => readonly UiModifier[];
  } = {}
): Harness {
  const confirmed: number[] = [];
  const cancelled: number[] = [];
  const args: HoldToConfirmArgs = {
    onConfirm: () => confirmed.push(1),
    onCancel: () => cancelled.push(1),
    ...options.args
  };
  // Built once, outside the render, so a re-render of the fixture is
  // the same arguments and leaves the modifier alone.
  const list: readonly UiModifier[] = [...(options.before ?? []), holdToConfirm(args)];
  const renders = new BehaviorSubject(0);
  const ui = renderTest(
    createComponent(fixture({ modifiers: options.modifiers ?? (() => list), renders, theme: options.theme }), {}),
    SIZE
  );
  const node = ui.getByText(LABEL).parent as UiNode;
  const box = ui.getLayout(node);
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  return {
    ui,
    node,
    at,
    confirmed,
    cancelled,
    rerender: () => {
      renders.next(renders.value + 1);
      ui.frame();
    }
  };
}

/** Drives frames at 16 ms until the clock reads `until`. */
function holdUntil(ui: Rendered, from: number, until: number): void {
  for (let time = from + 16; time <= until; time += 16) {
    ui.frame(time);
  }
}

/**
 * A modifier from outside the framework, against a real runtime.
 *
 * Everything goes in through the pointer and the clock: the dispatcher,
 * the override cascade, the decoration store and the animation driver
 * are all in the path, which is what B6 is asking about. A spec that
 * called `attach` with a fake host would prove only that the file
 * compiles.
 */
describe('holdToConfirm, a modifier written against public exports', () => {
  it('fills the element while the pointer is held, and confirms once the time is up', () => {
    const { ui, node, at, confirmed, cancelled } = mount();
    expect(node.decorations).toBeNull();
    expect(node.getProperty('borderColor')).toBe('controlBorder');

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    ui.frame(1016);

    // Half way: a fill of part of the width, and the border in the
    // theme's fill colour, written over the declared one.
    holdUntil(ui, 1016, 1316);
    expect(node.getProperty('borderColor')).toBe('danger');
    const partial = node.decorations;
    expect(partial).not.toBeNull();
    expect(partial).toHaveLength(1);
    const fill = partial![0] as { kind: string; width?: number; color: unknown };
    expect(fill.kind).toBe('fill');
    expect(fill.color).toBe('danger');
    expect(fill.width).toBeGreaterThan(0);
    expect(fill.width).toBeLessThan(200);
    expect(confirmed).toHaveLength(0);

    // The whole default duration and then some.
    holdUntil(ui, 1316, 1800);
    expect(confirmed).toHaveLength(1);
    expect(cancelled).toHaveLength(0);
    // Everything the hold wrote is gone: the declared border is back
    // through the cascade and the decoration is dropped.
    expect(node.decorations).toBeNull();
    expect(node.getProperty('borderColor')).toBe('controlBorder');

    // Lifting afterwards is not a second hold.
    ui.fireEvent.pointerUp(at.x, at.y);
    ui.frame();
    expect(confirmed).toHaveLength(1);
    expect(cancelled).toHaveLength(0);
  });

  it('lets go of a hold released early, and says so', () => {
    const { ui, node, at, confirmed, cancelled } = mount();

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    holdUntil(ui, 1000, 1200);
    expect(node.decorations).not.toBeNull();

    ui.fireEvent.pointerUp(at.x, at.y);
    ui.frame();

    expect(confirmed).toHaveLength(0);
    expect(cancelled).toHaveLength(1);
    expect(node.decorations).toBeNull();
    expect(node.getProperty('borderColor')).toBe('controlBorder');

    // Nothing left running: many frames later, still nothing.
    holdUntil(ui, 1216, 2400);
    expect(confirmed).toHaveLength(0);
    expect(cancelled).toHaveLength(1);
  });

  it('reads its duration and colour from the theme, as a theme extension', () => {
    const theme = withThemeExtension(darkTheme, holdToConfirmTokens, { duration: 200, fill: 'controlAccent' });
    const { ui, node, at, confirmed } = mount({ theme });

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    holdUntil(ui, 1000, 1100);
    expect(node.getProperty('borderColor')).toBe('controlAccent');
    expect(confirmed).toHaveLength(0);

    // 200 ms is up well before the 600 ms default would be.
    holdUntil(ui, 1100, 1300);
    expect(confirmed).toHaveLength(1);
  });

  it('takes the element’s own duration over the theme’s', () => {
    const theme = withThemeExtension(darkTheme, holdToConfirmTokens, { duration: 2000, fill: 'controlAccent' });
    const { ui, at, confirmed } = mount({ theme, args: { duration: 150 } });

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    holdUntil(ui, 1000, 1250);

    expect(confirmed).toHaveLength(1);
  });

  it('wins the border over a modifier before it in the list, and hands it back to that modifier on release', () => {
    const hover = interactive({ hover: true, press: false, hovered: { borderColor: 'controlAccent' } });
    const { ui, node, at, confirmed } = mount({ before: [hover] });

    ui.fireEvent.pointerMove(at.x, at.y);
    ui.frame();
    expect(node.getProperty('borderColor')).toBe('controlAccent');

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    holdUntil(ui, 1000, 1200);
    // Later in the list wins.
    expect(node.getProperty('borderColor')).toBe('danger');

    ui.fireEvent.pointerUp(at.x, at.y);
    ui.frame();
    // Not the declared value: the next override down, which is the
    // hover's, because the pointer is still over the element.
    expect(node.getProperty('borderColor')).toBe('controlAccent');
    expect(confirmed).toHaveLength(0);
  });

  it('keeps a hold in flight when its arguments change, and confirms into the new callback', () => {
    const first: number[] = [];
    const second: number[] = [];
    let handler = (): void => {
      first.push(1);
    };
    // Rebuilt on every render with a fresh closure, so a re-render is a
    // genuine change of arguments to a kind that has an `update`.
    const { ui, node, at, rerender } = mount({ modifiers: () => [holdToConfirm({ onConfirm: () => handler() })] });

    ui.frame(1000);
    ui.fireEvent.pointerDown(at.x, at.y);
    holdUntil(ui, 1000, 1200);
    expect(node.decorations).not.toBeNull();

    handler = (): void => {
      second.push(1);
    };
    rerender();
    // Still the same node, still filling: the change was taken in
    // place rather than as a detach and an attach.
    expect(ui.getByText(LABEL).parent).toBe(node);
    expect(node.decorations).not.toBeNull();

    holdUntil(ui, 1216, 1800);
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('imports nothing but package entry points', () => {
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map(match => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      // A bare package name, or a scoped one: no relative path and no
      // path into a package. `@gesso/core`, never `@gesso/core/src/…`.
      expect(specifier, `${specifier} is not a package entry point`).toMatch(/^(@[\w-]+\/)?[\w.-]+$/);
    }
  });
});
