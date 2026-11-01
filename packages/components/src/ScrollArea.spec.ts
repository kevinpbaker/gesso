import { BehaviorSubject, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  Box,
  Column,
  percent,
  provided,
  transform,
  UiClock,
  UiEnvironmentKeys,
  UiNodeType,
  type UiNode
} from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';

import { ScrollArea, type ScrollAreaProps } from './ScrollArea';

/** A 200-tall area over 1000 of content, in a window of its own size. */
function mount(props: Partial<ScrollAreaProps> = {}, clock?: UiClock) {
  const ui = renderTest(
    Box(
      {
        width: 300,
        height: 200,
        provide: clock === undefined ? undefined : [provided(UiEnvironmentKeys.clock, clock)]
      },
      createComponent(ScrollArea, {
        width: percent(100),
        height: percent(100),
        children: Column({ width: percent(100), height: 1000 }),
        ...props
      })
    ),
    { width: 300, height: 200 }
  );
  settle(ui);
  return ui;
}

let time = 0;
function settle(ui: Rendered): void {
  for (let i = 0; i < 40; i++) {
    time += 16;
    ui.frame(time);
  }
}

/** The two fades, top then bottom: the boxes painted with a gradient. */
function fades(ui: Rendered): [UiNode, UiNode] {
  const found = ui.allNodes().filter(node => node.properties.get('backgroundGradient') !== undefined);
  return [found[0]!, found[1]!];
}
const opacity = (node: UiNode) => node.properties.get('opacity') ?? 1;
const offsetOf = (ui: Rendered) => ui.allNodes().find(node => node.type === UiNodeType.ScrollView)!;

describe('ScrollArea', () => {
  it('fades the bottom while more is below, and the top once it is scrolled down', () => {
    const ui = mount();
    const [top, bottom] = fades(ui);
    expect(opacity(top)).toBe(0);
    expect(opacity(bottom)).toBe(1);

    ui.fireEvent.wheel({ x: 150, y: 100, deltaY: 2000 });
    settle(ui);

    // At the end now: the top fades in, the bottom out.
    expect(opacity(top)).toBe(1);
    expect(opacity(bottom)).toBe(0);
  });

  it('keeps its fades as a zoom above it scales it, however small it is drawn', () => {
    // A design tool's board: the area under a camera that zooms out to a
    // thousandth, where the 800 left below it is under a pixel on screen.
    const scale = new BehaviorSubject(1);
    const ui = renderTest(
      Box(
        { width: 300, height: 200, transform: scale.pipe(map(by => transform({ scaleX: by, scaleY: by }))) },
        createComponent(ScrollArea, {
          width: percent(100),
          height: percent(100),
          children: Column({ width: percent(100), height: 1000 })
        })
      ),
      { width: 300, height: 200 }
    );
    settle(ui);
    const [top, bottom] = fades(ui);
    for (const by of [0.5, 0.01, 0.001, 2]) {
      scale.next(by);
      settle(ui);
      expect(opacity(top)).toBe(0);
      expect(opacity(bottom)).toBe(1);
    }
  });

  it('pads its content inside the scroll bar, so the area itself runs to the edges', () => {
    const ui = mount({ padding: 24, paddingX: 16 });
    const view = offsetOf(ui);
    const rows = ui.allNodes().find(node => node.properties.get('height') === 1000)!;

    expect(ui.getLayout(view)).toMatchObject({ x: 0, width: 300 });
    expect(ui.getLayout(rows)).toMatchObject({ x: 16, y: 24, width: 268 });
  });

  it('starts where it is told to, with the fades and the button that belong there', () => {
    const ui = mount({ scrollY: 600, backToTopAfter: 300 });
    const [top, bottom] = fades(ui);
    expect(offsetOf(ui).properties.get('scrollY')).toBe(600);
    expect(opacity(top)).toBe(1);
    expect(opacity(bottom)).toBe(1);
    expect(ui.getByRole('button', { name: 'Back to top' })).toBeDefined();
  });

  it('starts at the end when told to, as a conversation shows its newest message', () => {
    const ui = mount({ startAt: 'end' });
    const [top, bottom] = fades(ui);
    expect(offsetOf(ui).properties.get('scrollY')).toBe(800);
    expect(opacity(top)).toBe(1);
    expect(opacity(bottom)).toBe(0);
  });

  it('fades into its own colour at no opacity, not into transparent black', () => {
    const [top] = fades(mount({ fadeColor: 'surface' }));
    const gradient = top.properties.get('backgroundGradient') as { stops: { color: string; opacity?: number }[] };
    expect(gradient.stops).toEqual([{ color: 'surface' }, { color: 'surface', opacity: 0 }]);
  });

  it('shows a way back to the top once it is far enough down, and takes it smoothly', () => {
    const ui = mount({ backToTopAfter: 300 });
    const button = () => ui.getByRole('button', { name: 'Back to top' });
    // The box that holds the button, in the corner, that shows and hides it.
    const holder = () =>
      ui.allNodes().find(node => node.properties.get('right') === 16 && node.properties.get('bottom') === 16)!;
    expect(opacity(holder())).toBe(0);

    ui.fireEvent.wheel({ x: 150, y: 100, deltaY: 500 });
    settle(ui);
    expect(opacity(holder())).toBe(1);

    ui.fireEvent.click(button());
    time += 16;
    ui.frame(time);
    time += 100;
    ui.frame(time);
    const partWay = offsetOf(ui).properties.get('scrollY') as number;
    expect(partWay).toBeGreaterThan(0);
    settle(ui);
    expect(offsetOf(ui).properties.get('scrollY')).toBe(0);
  });

  it('is back at the top at once on a settled clock, as on a design tool’s board', () => {
    const ui = mount({ backToTopAfter: 300 }, new UiClock({ settled: true }));
    ui.fireEvent.wheel({ x: 150, y: 100, deltaY: 500 });
    settle(ui);
    ui.fireEvent.click(ui.getByRole('button', { name: 'Back to top' }));

    expect(offsetOf(ui).properties.get('scrollY')).toBe(0);
  });
});
