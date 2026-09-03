import { describe, expect, it } from 'vitest';

import { Text } from '@gesso/core';

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
});
