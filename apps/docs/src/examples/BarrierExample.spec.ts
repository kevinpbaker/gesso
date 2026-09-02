import { afterEach, describe, expect, it } from 'vitest';

import { createChannelRegistry, createComponent, diffProjection } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { BarrierScreen, createTaskStore, tapChannel, taskSource, Tasks, type TaskStore } from './BarrierExample';

interface Mounted {
  ui: Rendered;
  store: TaskStore;
  /** Every message that has crossed the barrier, newest last. */
  wire: () => readonly string[];
}

let dispose: (() => void) | null = null;

function mount(): Mounted {
  const store = createTaskStore();
  const tap = tapChannel(taskSource(store));
  const channels = createChannelRegistry([{ token: Tasks, worker: tap.handle }]);
  const ui = renderTest(createComponent(BarrierScreen, { traffic: tap.traffic }), {
    width: 640,
    height: 320,
    channels: channels.registry
  });
  // Patches are queued and applied in the frame's first phase, so a
  // burst between two frames costs one pass rather than one per patch.
  ui.runtime.deferPatchesFrom(channels.registry.all());
  dispose = () => channels.dispose();
  return { ui, store, wire: () => tap.traffic.value };
}

afterEach(() => {
  dispose?.();
  dispose = null;
});

/**
 * The claim is an asymmetry: typed commands go one way, patches come
 * back the other, and nothing else crosses. The tap in the example is
 * a real port between the two ends, so the spec can read the traffic
 * rather than infer it.
 */
describe('the docs barrier example', () => {
  it("draws the token's initial value before any patch has arrived", () => {
    const { ui } = mount();

    // The replica seeds every key from the token, so the first frame
    // has something to draw and no key is ever `undefined`.
    expect(ui.getByText('Waiting for the first patch')).toBeDefined();
  });

  it('sends a typed command one way and receives patches the other', async () => {
    const { ui, store, wire } = mount();

    await ui.findByText('2 of 3 left');
    ui.fireEvent.click(ui.getByRole('button', { name: 'Wrap the lines' }));

    // The command reached the thread that owns the data: the store
    // changed, and the view had nothing to do with the change.
    await ui.findByText('1 of 3 left');
    expect(store.tasks.value[1]!.done).toBe(true);

    const traffic = wire();
    expect(traffic).toContain('↑ toggle("wrap")');
    // What came back is a patch at the path that changed, not a
    // resend of the list: one differ, and it trims what it can. Keys
    // are diffed and posted one at a time, so the derived summary is
    // a batch of its own.
    expect(traffic).toContain('↓ set tasks[1].done');
    expect(traffic).toContain('↓ set remaining');
    // Nothing else crosses. Every line is a command out or a patch in.
    expect(traffic.every(line => line.startsWith('↑') || line.startsWith('↓'))).toBe(true);
  });

  it('follows a change the view never asked for', async () => {
    const { ui, store } = mount();
    await ui.findByText('2 of 3 left');

    // The application decided these on its own, as a poll or a push
    // would. The view is told the same way it is told about anything,
    // and a burst between two frames is applied in one pass.
    store.toggle('wrap');
    store.toggle('paint');

    await ui.findByText('All done');
  });

  it('describes a change to one row as a patch to one row', () => {
    const before = [
      { id: 'wrap', title: 'Wrap the lines', done: false },
      { id: 'paint', title: 'Paint the glyphs', done: false }
    ];
    const after = [before[0]!, { ...before[1]!, done: true }];

    // The differ the barrier runs, on the shape this example
    // publishes: a common prefix costs nothing and the edit is one
    // patch at the path that changed.
    expect(diffProjection('tasks', before, after)).toEqual([
      { op: 'set', projection: 'tasks', path: [1, 'done'], value: true }
    ]);
  });
});
