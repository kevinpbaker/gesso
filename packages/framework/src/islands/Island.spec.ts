import { describe, expect, it } from 'vitest';
import { BehaviorSubject, map } from 'rxjs';

import { Button, Column, ScrollView, Text, noKeyModifiers, type UiChild } from 'gesso-core';
import { createComponent } from '../createComponent';
import { FocusService } from '../app/FocusService';
import { mountRuntime } from '../app/RuntimeTestUtils';
import { island } from './islandToken';
import { Island, islandController } from './Island';
import type { IslandUpdate } from './IslandProtocol';
import { IslandService } from './IslandService';

const Probe = island<{ label: string }, { said: string }>('spec:probe');

/**
 * An `Island` in a running runtime: what the shell is sent each frame,
 * and what comes back. The shell is a list of the updates it received.
 */
function mountIsland(
  tree: (island: UiChild) => UiChild,
  options: Parameters<typeof createComponent<typeof Island>>[1]
) {
  const updates: IslandUpdate[] = [];
  const mounted = mountRuntime(tree(createComponent(Island, options)), {
    onCreate: runtime => runtime.onIslands(update => updates.push(update))
  });
  mounted.frame(0);
  return { ...mounted, updates, focus: mounted.runtime.services.get(FocusService) };
}

describe('an Island in the runtime', () => {
  it('is made on the first frame, with its props and where its box is', () => {
    const { updates } = mountIsland(island => Column({ padding: 10 }, island), {
      of: Probe,
      props: { label: 'first' },
      width: 200,
      height: 40
    });
    const mount = updates.flatMap(update => update.mounts ?? [])[0];
    expect(mount).toMatchObject({ kind: 'spec:probe', props: { label: 'first' }, standIn: 'never' });
    const place = updates.flatMap(update => update.places ?? []).find(placement => placement.id === mount!.id);
    expect(place).toMatchObject({
      visible: true,
      box: { x: 10, y: 10, width: 200, height: 40 },
      cuts: [],
      opacity: 1,
      moving: false,
      focused: false,
      inert: false
    });
  });

  it('sends new props on the next frame, with the last event it had handled', () => {
    const label = new BehaviorSubject('first');
    const said: string[] = [];
    const mounted = mountIsland(island => Column(island), {
      of: Probe,
      props: label.pipe(map(text => ({ label: text }))),
      onEvent: (event: unknown) => said.push((event as { said: string }).said),
      width: 100,
      height: 20
    });
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.applyIslandMessage({ type: 'islandEvent', id, event: { said: 'hello' }, seq: 3 });
    expect(said).toEqual(['hello']);
    label.next('second');
    mounted.frame();
    expect(mounted.updates.at(-1)!.props).toEqual([{ id, props: { label: 'second' }, seen: 3 }]);
  });

  it('sends nothing on a frame that changes nothing about it', () => {
    const other = new BehaviorSubject('a');
    const mounted = mountIsland(island => Column(Text({ text: other }), island), {
      of: Probe,
      props: { label: 'x' },
      width: 100,
      height: 20
    });
    const before = mounted.updates.length;
    other.next('b');
    mounted.frame();
    expect(mounted.updates.length).toBe(before);
  });

  it('is a tab stop: the frame names it when the runtime focuses it, and null when focus leaves', () => {
    const mounted = mountIsland(island => Column(Button({ text: 'Before' }), island, Button({ text: 'After' })), {
      of: Probe,
      props: { label: 'x' },
      width: 100,
      height: 20
    });
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.input.keyboard.keyDown('Tab', noKeyModifiers());
    mounted.runtime.input.keyboard.keyDown('Tab', noKeyModifiers());
    mounted.frame();
    expect(mounted.updates.at(-1)!.focused).toBe(id);
    mounted.runtime.input.keyboard.keyDown('Tab', noKeyModifiers());
    mounted.frame();
    expect(mounted.updates.at(-1)!.focused).toBeNull();
  });

  it('takes the runtime focus when DOM focus goes into its element', () => {
    const mounted = mountIsland(island => Column(Button({ text: 'Before' }), island), {
      of: Probe,
      props: { label: 'x' },
      width: 100,
      height: 20
    });
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.applyIslandMessage({ type: 'islandFocus', id });
    expect(mounted.focus.focused.value?.id).toBe(id);
  });

  it('reports the box moving while its container scrolls, and still on the frame after', () => {
    const rows: UiChild[] = [];
    for (let index = 0; index < 20; index += 1) {
      rows.push(Text({ text: `Row ${index}`, height: 30 }));
    }
    const mounted = mountIsland(
      island => ScrollView({ width: 300, height: 200 }, Column(...rows.slice(0, 3), island, ...rows.slice(3))),
      { of: Probe, props: { label: 'x' }, width: 100, height: 20 }
    );
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.wheel(50, 50, 0, 40, noKeyModifiers(), 0);
    mounted.runtime.releaseWheel();
    mounted.frame();
    const moved = mounted.updates.flatMap(update => update.places ?? []).filter(placement => placement.id === id);
    expect(moved.some(placement => placement.moving)).toBe(true);
    // The frame after the last move is asked for and says it has stopped.
    for (let index = 0; index < 30; index += 1) {
      mounted.frame();
    }
    const last = mounted.updates
      .flatMap(update => update.places ?? [])
      .filter(placement => placement.id === id)
      .at(-1);
    expect(last?.moving).toBe(false);
    expect(last?.box.y).toBeLessThan(90);
  });

  it('is clipped by its scroll container, and not visible once scrolled out of it', () => {
    const rows: UiChild[] = [];
    for (let index = 0; index < 20; index += 1) {
      rows.push(Text({ text: `Row ${index}`, height: 30 }));
    }
    const mounted = mountIsland(
      island => ScrollView({ width: 300, height: 100 }, Column(...rows.slice(0, 2), island, ...rows.slice(2))),
      { of: Probe, props: { label: 'x' }, width: 100, height: 20 }
    );
    const id = mounted.updates[0]!.mounts![0]!.id;
    const first = mounted.updates[0]!.places!.find(placement => placement.id === id)!;
    expect(first.clip).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    mounted.runtime.wheel(50, 50, 0, 200, noKeyModifiers(), 0);
    mounted.runtime.releaseWheel();
    for (let index = 0; index < 30; index += 1) {
      mounted.frame();
    }
    const last = mounted.updates
      .flatMap(update => update.places ?? [])
      .filter(placement => placement.id === id)
      .at(-1);
    expect(last?.visible).toBe(false);
  });

  it('is dropped on the frame it leaves the tree', () => {
    const shown = new BehaviorSubject(true);
    const updates: IslandUpdate[] = [];
    const mounted = mountRuntime(
      Column(
        shown.pipe(
          map(on => (on ? [createComponent(Island, { of: Probe, props: { label: 'x' }, width: 10, height: 10 })] : []))
        )
      ),
      { onCreate: runtime => runtime.onIslands(update => updates.push(update)) }
    );
    mounted.frame(0);
    const id = updates[0]!.mounts![0]!.id;
    shown.next(false);
    mounted.frame();
    expect(updates.at(-1)!.unmounts).toEqual([id]);
  });

  it('carries a controller message, and a form submission a canvas button asked for', () => {
    const controller = islandController();
    controller.post({ early: true });
    const mounted = mountIsland(island => Column(island), {
      of: Probe,
      props: { label: 'x' },
      controller,
      width: 10,
      height: 10
    });
    const id = mounted.updates[0]!.mounts![0]!.id;
    expect(mounted.updates.flatMap(update => update.posts ?? [])).toEqual([{ id, message: { early: true } }]);
    mounted.runtime.services.get(IslandService).submitForm('sign-in');
    mounted.frame();
    expect(mounted.updates.at(-1)!.submits).toEqual(['sign-in']);
  });

  it('calls onSubmit when its form is submitted from the page', () => {
    let submitted = 0;
    const mounted = mountIsland(island => Column(island), {
      of: Probe,
      props: { label: 'x' },
      onSubmit: () => (submitted += 1),
      width: 10,
      height: 10
    });
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.applyIslandMessage({ type: 'islandSubmit', form: 'sign-in', id });
    expect(submitted).toBe(1);
  });

  it('draws its stand-in while unfocused under the unfocused rule, and a few frames past focus', () => {
    const showing: boolean[] = [];
    const mounted = mountIsland(island => Column(Button({ text: 'Before' }), island), {
      of: Probe,
      props: { label: 'x' },
      standIn: 'unfocused',
      onStandIn: (on: boolean) => showing.push(on),
      width: 10,
      height: 10
    });
    expect(showing.at(-1)).toBe(true);
    const id = mounted.updates[0]!.mounts![0]!.id;
    mounted.runtime.applyIslandMessage({ type: 'islandFocus', id });
    mounted.frame();
    // Held while the element catches up on the main thread.
    expect(showing.at(-1)).toBe(true);
    for (let index = 0; index < 6; index += 1) {
      mounted.frame();
    }
    expect(showing.at(-1)).toBe(false);
  });
});
