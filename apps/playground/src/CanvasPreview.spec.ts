import { describe, expect, it } from 'vitest';

import { Constraints, UiManualFrameClock } from 'gesso-core';
import { callArgs, callNames, callsOf, FakeCanvasHost, RecordingCanvasContext } from 'gesso-core/testing';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';
import { createDefinition } from './PlaygroundDefinition';
import { PlaygroundState } from './PlaygroundState';

/**
 * Proves the runtime works end-to-end: a LayoutPlayground laid out
 * through the real scheduler is painted by Canvas2DRenderer through
 * CanvasPreview, and the recorded draw calls reflect the scene.
 *
 * The CanvasTextMeasurer is shared by layout and paint, exactly as
 * in the browser canvas route, so sizes agree.
 */
interface Harness {
  clock: UiManualFrameClock;
  playground: LayoutPlayground;
  state: PlaygroundState;
  context: RecordingCanvasContext;
  preview: CanvasPreview;
}

function createHarness(): Harness {
  const clock = new UiManualFrameClock(() => {});
  const context = new RecordingCanvasContext();
  const preview = new CanvasPreview(new FakeCanvasHost(context));
  const playground = new LayoutPlayground({
    clock: callback => {
      clock.setCallback(callback);
      return clock;
    },
    constraints: Constraints.loose(600, 600),
    textMeasurer: preview.textMeasurer
  });
  const state = new PlaygroundState();
  playground.build(createDefinition(state));
  preview.setLogicalSize(600, 600, 1);
  return { clock, playground, state, context, preview };
}

function tick(h: Harness): void {
  h.clock.tick(0);
}

function render(h: Harness): void {
  h.preview.render(h.playground.layoutRoot, h.playground.engine);
}

describe('CanvasPreview', () => {
  it('paints the playground scene through the real renderer', () => {
    const h = createHarness();
    tick(h);
    render(h);

    const names = callNames(h.context);
    expect(names).toContain('clearRect');

    const textCalls = callsOf(h.context, 'fillText').map(call => call.args[0]);
    expect(textCalls).toContain('Layout Playground');
    expect(textCalls.some(text => typeof text === 'string' && text.startsWith('Scroll item'))).toBe(true);

    const fills = callArgs(h.context, 'set:fillStyle') as unknown as string[];
    expect(fills).toContain('#1f6feb');
    expect(fills).toContain('#6f42c1');

    expect(callNames(h.context)).toContain('stroke');
  });

  it('reflects live paint bindings in the draw calls', () => {
    const h = createHarness();
    tick(h);
    h.state.color$.next('#ff0000');
    tick(h);
    render(h);

    const fills = callArgs(h.context, 'set:fillStyle') as unknown as string[];
    expect(fills).toContain('#f00');
  });

  it('translates scrolled content by the bound scroll offset', () => {
    const h = createHarness();
    tick(h);
    h.state.scrollY$.next(40);
    tick(h);
    render(h);

    const translates = callArgs(h.context, 'translate') as [number, number][];
    expect(translates).toContainEqual([0, -40]);
  });
});
