import { describe, expect, it } from 'vitest';

import { Box, Column, defineModifier, Text, type UiNode } from 'gesso-core';

import { createComponent } from '../createComponent';
import type { ComponentContext } from '../FunctionComponent';
import type { Inputs } from '../FunctionComponent';
import { internalState } from '../InternalState';
import { FrameService } from './FrameService';
import type { FrameMetrics } from './GessoRuntime';
import { mountRuntime } from './RuntimeTestUtils';

describe('FrameService', () => {
  it('hands a component every frame the runtime draws', () => {
    const heard: FrameMetrics[] = [];
    const label = internalState('listening');
    function Listener(_inputs: Inputs<{}>, ctx: ComponentContext) {
      ctx.inject(FrameService).frames.subscribe(metrics => heard.push(metrics));
      return Text({ text: label });
    }
    const mounted = mountRuntime(createComponent(Listener));
    mounted.frame(16);
    // Frames are on demand: a second one needs something to draw.
    label.value = 'still listening';
    mounted.frame(32);

    expect(heard.length).toBeGreaterThanOrEqual(2);
    expect(heard.at(-1)!.frame).toBeGreaterThan(heard[0]!.frame);
    expect(heard.every(metrics => metrics.inputLatencyMs === null)).toBe(true);
  });

  it('runs what waits for the layout listeners once they have all been told, and paints what it changes on that frame', () => {
    const heights = new Map<number, number>();
    let runs = 0;
    let total = 0;
    const sum = internalState(0);
    let frames!: FrameService;
    // Each box hears its own height; the sum of them all is worked out once, after the last.
    const measured = defineModifier<number>({
      name: 'measured',
      attach(host, index) {
        host.onLayout(box => {
          heights.set(index, box.height);
          frames.afterLayoutListeners(addUp);
        });
      }
    });
    const addUp = () => {
      runs++;
      total = [...heights.values()].reduce((a, b) => a + b, 0);
      sum.value = total;
    };
    function Blocks(_inputs: Inputs<{}>, ctx: ComponentContext) {
      frames = ctx.inject(FrameService);
      return Column(
        {},
        ...Array.from({ length: 50 }, (_, i) => Box({ height: 10 + i, modifiers: [measured(i)] })),
        // As tall as the blocks above it together: laid out from what the waiting work wrote.
        Box({ label: 'sum', width: 10, height: sum })
      );
    }
    const mounted = mountRuntime(createComponent(Blocks), { width: 400, height: 4000 });
    mounted.frame();

    expect(runs).toBe(1);
    expect(total).toBe(50 * 10 + (49 * 50) / 2);
    // On the frame it was worked out, not the one after.
    const find = (node: UiNode): UiNode | undefined => {
      if (node.properties.get('label') === 'sum') return node;
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        const found = find(child);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    expect(mounted.runtime.debugLayoutBox(find(mounted.runtime.debugRoot())!).height).toBe(total);
    expect(mounted.frames).toHaveLength(1);
  });

  it('runs at once when no layout listeners are being told', () => {
    let frames!: FrameService;
    function Idle(_inputs: Inputs<{}>, ctx: ComponentContext) {
      frames = ctx.inject(FrameService);
      return Text({ text: 'idle' });
    }
    const mounted = mountRuntime(createComponent(Idle));
    mounted.frame();
    let ran = false;
    frames.afterLayoutListeners(() => (ran = true));
    expect(ran).toBe(true);
  });
});
