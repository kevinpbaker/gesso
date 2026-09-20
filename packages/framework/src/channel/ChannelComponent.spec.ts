import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import { Component } from '../Component';
import { Channel, Define } from '../decorators';
import { Column, Text } from 'gesso-core';
import { createComponent } from '../createComponent';
import { mountRuntime } from '../app/RuntimeTestUtils';
import { channel } from './ChannelToken';
import { createChannelRegistry } from './createChannelRegistry';
import type { ChannelReplica } from './ChannelReplica';

interface CounterView {
  label: string;
  total: number;
}
interface CounterCommands {
  bump(by: number): void;
}

const Counter = channel<CounterView, CounterCommands>('counter', { label: 'idle', total: 0 });

/** The application: plain RxJS, and no framework import above here. */
function createCounterApp() {
  const total = new BehaviorSubject(0);
  return {
    total,
    label: total.pipe(map(value => (value === 0 ? 'idle' : `counted ${value}`))),
    bump(by: number) {
      total.next(total.value + by);
    }
  };
}

@Define('counter-view')
class CounterComponent extends Component {
  @Channel(Counter) counter!: ChannelReplica<CounterView, CounterCommands>;

  override render() {
    return Column(Text({ text: this.counter.view.label }), Text({ text: this.counter.view.total.pipe(map(String)) }));
  }
}

/**
 * Waits on the value rather than on a delay. A command makes four port
 * hops — component to provider, patch back — and a timeout long enough
 * on an idle machine is not long enough on a busy one.
 */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function drawnText(canvas: { ctx: Record<string, { mock: { calls: unknown[][] } }> }): string[] {
  return canvas.ctx.fillText.mock.calls.map(call => String(call[0]));
}

describe('a channel driving a component', () => {
  it('renders the token value, then follows the patch stream', async () => {
    const app = createCounterApp();
    const channels = createChannelRegistry([
      {
        token: Counter,
        source: {
          view: { label: app.label, total: app.total },
          commands: { bump: (by: number) => app.bump(by) }
        }
      }
    ]);

    const mounted = mountRuntime(createComponent(CounterComponent), { channels: channels.registry });
    mounted.runtime.deferPatchesFrom(channels.registry.all());
    mounted.frame();

    // The initial value came from the token, with no patch involved.
    expect(drawnText(mounted.canvas)).toContain('idle');
    expect(drawnText(mounted.canvas)).toContain('0');

    // A command from the component reaches the application, and its
    // effect comes back as patches that redraw the bound text.
    const counter = channels.registry.get(Counter);
    counter.send.bump(3);
    // The cell does not move on arrival: patches are queued and applied
    // in the frame's first phase, so the wait is for the queue and the
    // frame is what publishes them.
    await waitFor(() => counter.hasPendingPatches, 'the patches for the command');
    mounted.frame();
    expect(counter.view.total.value).toBe(3);

    expect(drawnText(mounted.canvas)).toContain('counted 3');
    expect(drawnText(mounted.canvas)).toContain('3');

    channels.dispose();
  });

  it('flushes a burst of patches in one frame', async () => {
    const app = createCounterApp();
    const channels = createChannelRegistry([
      { token: Counter, source: { view: { label: app.label, total: app.total } } }
    ]);
    const mounted = mountRuntime(createComponent(CounterComponent), { channels: channels.registry });
    mounted.runtime.deferPatchesFrom(channels.registry.all());
    mounted.frame();
    const framesBefore = mounted.frames.length;

    const counter = channels.registry.get(Counter);
    app.total.next(1);
    app.total.next(2);
    app.total.next(3);
    await waitFor(() => counter.hasPendingPatches, 'the burst to queue');
    mounted.frame();

    // Three changes, one frame: queued patches are applied together in
    // the frame's first phase rather than rebuilding once per patch.
    expect(mounted.frames.length).toBe(framesBefore + 1);
    expect(drawnText(mounted.canvas)).toContain('counted 3');

    channels.dispose();
  });

  it('names the channel when a component asks for one that is not attached', () => {
    expect(() => mountRuntime(createComponent(CounterComponent))).toThrow(
      /Channel 'counter' is not attached\. Did you forget useChannel/
    );
  });
});
