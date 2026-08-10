import { describe, expect, it } from 'vitest';

import { Constraints } from '../ui/layout';
import { callArgs, callsOf, FakeCanvasHost, RecordingCanvasContext } from '../ui/rendering/RenderTestUtils';
import { UiManualFrameClock } from '../ui/scheduler';
import { advance, BindingDemoState, createBindingDefinition } from './BindingDemo';
import { CanvasPreview } from './CanvasPreview';
import { LayoutPlayground } from './LayoutPlayground';

interface Harness {
  clock: UiManualFrameClock;
  playground: LayoutPlayground;
  state: BindingDemoState;
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
  const state = new BindingDemoState();
  playground.build(createBindingDefinition(state));
  preview.setLogicalSize(600, 600, 1);
  return { clock, playground, state, context, preview };
}

function tick(h: Harness): void {
  h.clock.tick(0);
}

function render(h: Harness): void {
  h.preview.render(h.playground.layoutRoot, h.playground.engine);
}

function record(h: Harness, id: string) {
  const record = h.playground.engine.recordFor(h.playground.graph.requireNode(id));
  if (record === undefined) {
    throw new Error(`No layout record for '${id}'.`);
  }
  return record;
}

function fillTexts(h: Harness): unknown[] {
  return callsOf(h.context, 'fillText').map(call => call.args[0]);
}

describe('BindingDemo', () => {
  it('renders the initial scene through the real renderer', () => {
    const h = createHarness();
    tick(h);
    render(h);

    expect(fillTexts(h)).toContain('Binding 0');
    expect(fillTexts(h)).toContain('Scroll item 1');
    expect(record(h, 'root:0:1:1').width).toBe(40);
  });

  it('reflects a data advance in layout and paint without a rebuild', () => {
    const h = createHarness();
    tick(h);
    render(h);

    advance(h.state, 1);
    expect(h.playground.graph.getDirtyNodes().size).toBeGreaterThan(0);
    tick(h);
    render(h);

    expect(fillTexts(h)).toContain('Binding 1');
    expect(record(h, 'root:0:1:1').width).toBe(80);
    const fills = callArgs(h.context, 'set:fillStyle') as unknown as string[];
    expect(fills).toContain('#6f42c1');
  });

  it('reflects the bound scroll offset in the draw calls', () => {
    const h = createHarness();
    tick(h);
    advance(h.state, 2);
    tick(h);
    render(h);

    const translates = callArgs(h.context, 'translate') as [number, number][];
    expect(translates).toContainEqual([0, -40]);
  });
});
