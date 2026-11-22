import { describe, expect, it, vi } from 'vitest';

import { Canvas2DRenderer } from 'gesso-core';
import { createComponent, type ComponentType } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';

/**
 * How many frames each docs example draws whole while it is used, held
 * to a recorded count.
 *
 * A frame is drawn whole when the renderer cannot name what changed:
 * a box moved, the damage is most of the surface, something it drew
 * cannot be placed. Some of those are right (a menu opening moves
 * boxes), but most of the ones found were not, and nothing failed when
 * they came in: a clock that ticked once a second, a progress bar that
 * swept by layout, a sticky header, a virtual grid recycling rows.
 * Each drew the whole surface for a change a few pixels wide, and each
 * was found by an audit, not by a test.
 *
 * So every example is mounted and used the same way (idle, a pointer
 * swept across it, Tab, the arrows, typing where there is a field, the
 * wheel) and the whole frames of each part are counted, against
 * `wholeFrames.baseline.json`. A count that rises is a frame some
 * change made whole; one that falls is a frame some change saved. Either
 * way the diff names the example and the part, and once it is the
 * change meant, the file is written again:
 *
 *   pnpm vitest run apps/docs/src/examples/wholeFrames.spec.ts -u
 *
 * The counts are the test renderer's: a 640 by 480 surface, Canvas2D,
 * text measured by character count, timers moved 16 ms a frame. They
 * are not a browser's, but the rule that decides whole or part is the
 * same code.
 */

const workers = import.meta.glob('./*ExampleWorker.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const modules = import.meta.glob('./*Example.tsx') as Record<string, () => Promise<Record<string, ComponentType>>>;

interface Example {
  readonly name: string;
  readonly component: string;
  readonly module: string;
  readonly props: string | undefined;
}

/** Each example worker's component and props, read from the worker's own source. */
const examples: Example[] = Object.keys(workers)
  .sort()
  .flatMap(path => {
    const source = workers[path]!;
    const made = /createComponent\((\w+),\s*(\{[^)]*\})?\)/.exec(source);
    const from = made && new RegExp(`import \\{[^}]*\\b${made[1]}\\b[^}]*\\} from '(\\./[^']+)'`).exec(source);
    return made === null || from === null
      ? []
      : [
          {
            name: path.slice(2).replace('Worker.ts', ''),
            component: made[1]!,
            module: `${from[1]}.tsx`,
            props: made[2]
          }
        ];
  });

/** Mounts one example and uses it, part by part, counting each part's whole frames. */
async function use(example: Example): Promise<Record<string, number>> {
  const module = await modules[example.module]!();
  const props =
    example.props === undefined || example.props.trim() === '{}'
      ? {}
      : (new Function(`return ${example.props}`)() as Record<string, unknown>);
  const render = vi.spyOn(Canvas2DRenderer.prototype, 'render');
  // Timers move with the frames, 16 ms a frame: a sweep, a blink or a
  // tooltip's delay otherwise ran at the machine's speed, and the
  // counts with it.
  vi.useFakeTimers();
  let ui: Rendered | null = null;
  const counts: Record<string, number> = {};
  try {
    ui = renderTest(createComponent(module[example.component]!, props), { width: 640, height: 480 });
    let time = 0;
    const step = (frames = 1): void => {
      for (let i = 0; i < frames; i++) {
        vi.advanceTimersByTime(16);
        ui!.frame((time += 16));
      }
    };
    const whole = (): number => (render.mock.contexts.at(-1) as Canvas2DRenderer | undefined)?.damageStats.whole ?? 0;
    const part = (name: string, run: () => void): void => {
      const before = whole();
      run();
      counts[name] = whole() - before;
    };
    step(40);
    part('idle', () => step(60));
    part('hover', () => {
      for (let y = 20; y < 480; y += 60) {
        for (let x = 20; x < 640; x += 60) {
          ui!.fireEvent.pointerMove(x, y);
          step(2);
        }
      }
      ui!.fireEvent.pointerMove(-10, -10);
      step(30);
    });
    part('tab', () => {
      for (let i = 0; i < 8; i++) {
        ui!.fireEvent.tab();
        step(6);
      }
      step(30);
    });
    part('arrows', () => {
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
        ui!.fireEvent.press(key);
        step(6);
      }
      ui!.fireEvent.press('Escape');
      step(30);
    });
    let field;
    try {
      field = ui.getAllByRole('textbox')[0];
    } catch {
      field = undefined;
    }
    if (field !== undefined) {
      ui.fireEvent.focus(field);
      step(10);
      part('type', () => {
        for (const letter of 'hello') {
          ui!.fireEvent.type(letter);
          step(4);
        }
        ui!.fireEvent.press('Backspace');
        step(20);
      });
    }
    part('wheel', () => {
      for (let i = 0; i < 6; i++) {
        ui!.fireEvent.wheel({ x: 320, y: 240, deltaY: 60 });
        step(3);
      }
      step(40);
    });
  } finally {
    ui?.unmount();
    render.mockRestore();
    vi.useRealTimers();
  }
  return counts;
}

describe('whole frames while the docs examples are used', () => {
  const measured: Record<string, Record<string, number> | string> = {};

  for (const example of examples) {
    it(`uses ${example.name}`, async () => {
      try {
        measured[example.name] = await use(example);
      } catch (error) {
        // An example that needs its page around it (a channel the docs
        // page attaches) is recorded as one that cannot be mounted
        // alone, so one that newly cannot shows in the diff too.
        measured[example.name] = `not mounted alone: ${String(error).split('\n')[0]}`;
      }
    }, 60_000);
  }

  it('draws as many frames whole as recorded', async () => {
    const sorted = Object.fromEntries(
      Object.keys(measured)
        .sort()
        .map(name => [name, measured[name]])
    );
    await expect(`${JSON.stringify(sorted, null, 2)}\n`).toMatchFileSnapshot('./wholeFrames.baseline.json');
  });
});
