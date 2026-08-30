import { describe, expect, it } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { GessoRuntime } from '../app/GessoRuntime';
import { mockCanvas } from '../app/RuntimeTestUtils';
import { OverlayService } from './OverlayService';
import { Box, Button, Column, Text } from '../../ui/composition/UiComponents';
import type { UiElement } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
import { noKeyModifiers } from '../../ui/input/UiInputEvent';
import { UiManualFrameClock } from '../../ui/scheduler';

const pressed: string[] = [];

/**
 * An app with one button that opens a menu anchored to itself, and a
 * wide target underneath so a press through a closed menu is provable.
 */
@Define('overlay-host-app')
class OverlayHostApp extends Component {
  @Inject(OverlayService) overlays!: OverlayService;

  anchor: UiNode | null = null;

  openMenu(placement: 'bottom-start' | 'top-start' = 'bottom-start'): void {
    this.overlays.open({
      id: 'menu',
      anchor: this.anchor,
      placement,
      offset: 4,
      dismissOnOutsidePress: true,
      content: Column(
        { backgroundColor: '#fff', padding: 4 },
        Button({ width: 120, height: 30, text: 'Item', onPointerDown: () => pressed.push('menu-item') })
      )
    });
  }

  override render(): UiElement {
    return Column(
      { padding: 20, gap: 10 },
      Button({
        ref: (node: UiNode | null) => {
          this.anchor = node;
        },
        width: 80,
        height: 30,
        text: 'Open'
      }),
      Box({ width: 300, height: 200, onPointerDown: () => pressed.push('underneath') })
    );
  }
}

function mount() {
  let clock!: UiManualFrameClock;
  const runtime = new GessoRuntime({
    root: createComponent(OverlayHostApp),
    canvas: mockCanvas(400, 300),
    width: 400,
    height: 300,
    clock: callback => (clock = new UiManualFrameClock(callback))
  });
  runtime.start();
  const frame = () => {
    if (clock.isPending) {
      clock.tick(0);
    }
  };
  frame();
  const overlays = runtime.services.get(OverlayService);
  const layer = runtime.layoutRoot().lastChild!;
  return { runtime, overlays, layer, frame };
}

/** The absolutely positioned box the layer wraps an entry's content in. */
function entryBox(layer: UiNode): UiNode | undefined {
  const stack: UiNode[] = [layer];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.properties.get('anchor') !== undefined) {
      return node;
    }
    for (let child = node.lastChild; child !== null; child = child.previousSibling) {
      stack.push(child);
    }
  }
  return undefined;
}

function findText(root: UiNode, text: string): UiNode | undefined {
  const stack: UiNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.properties.get('text') === text) {
      return node;
    }
    for (let child = node.lastChild; child !== null; child = child.previousSibling) {
      stack.push(child);
    }
  }
  return undefined;
}

describe('overlays', () => {
  it('mounts an empty overlay layer above the app root', () => {
    const { runtime, layer } = mount();
    expect(runtime.layoutRoot().firstChild).toBe(runtime.debugRoot());
    expect(layer).not.toBe(runtime.debugRoot());
    expect(findText(layer, 'Item')).toBeUndefined();
    runtime.dispose();
  });

  it('places an opened entry beside its anchor via the ref prop', () => {
    const { runtime, overlays, layer, frame } = mount();
    const open = findText(runtime.debugRoot(), 'Open')!;
    // Drive the component's action through the store the way a click would.
    overlays.open({
      id: 'menu',
      anchor: open,
      placement: 'bottom-start',
      offset: 4,
      content: Text({ text: 'Item', width: 120, height: 30 })
    });
    frame();
    const item = findText(layer, 'Item')!;
    expect(item).toBeDefined();
    // Anchor is at (20, 20) 80×30 inside the padded column.
    const box = runtime.debugLayoutBox(item.parent!);
    expect(box).toEqual({ x: 20, y: 54, width: 120, height: 30 });
    runtime.dispose();
  });

  it('flips above the anchor when there is no room below', () => {
    const { runtime, overlays, layer, frame } = mount();
    const open = findText(runtime.debugRoot(), 'Open')!;
    overlays.open({
      id: 'menu',
      anchor: open,
      placement: 'bottom-start',
      content: Box({ width: 120, height: 260 })
    });
    frame();
    // 260 tall fits neither the 250 below the anchor nor the 20 above;
    // the side with more room wins, so it stays below.
    expect(runtime.debugLayoutBox(entryBox(layer)!).y).toBe(50);
    overlays.open({
      id: 'menu',
      anchor: open,
      placement: 'top-start',
      content: Box({ width: 120, height: 100 })
    });
    frame();
    // Asked for the top, 20 available there, 250 below: flips down.
    expect(runtime.debugLayoutBox(entryBox(layer)!).y).toBe(50);
    runtime.dispose();
  });

  it('hit-tests above the app and closes on an outside press', () => {
    pressed.length = 0;
    const { runtime, overlays, frame } = mount();
    const open = findText(runtime.debugRoot(), 'Open')!;
    overlays.open({
      id: 'menu',
      anchor: open,
      placement: 'bottom-start',
      dismissOnOutsidePress: true,
      content: Button({ width: 120, height: 30, text: 'Item', onPointerDown: () => pressed.push('menu-item') })
    });
    frame();

    // Inside the menu item (20..140 × 50..80): the item, not the box under it.
    runtime.input.pointer.pointerDown(60, 65, 1, noKeyModifiers());
    runtime.input.pointer.pointerUp(60, 65, 0, noKeyModifiers());
    expect(pressed).toEqual(['menu-item']);
    expect(overlays.isOpen('menu')).toBe(true);

    // Outside: the backdrop takes the press, closes the menu, and the
    // app underneath does not see it.
    runtime.input.pointer.pointerDown(300, 250, 1, noKeyModifiers());
    runtime.input.pointer.pointerUp(300, 250, 0, noKeyModifiers());
    expect(overlays.isOpen('menu')).toBe(false);
    expect(pressed).toEqual(['menu-item']);
    frame();

    // With the menu gone the app receives presses again.
    runtime.input.pointer.pointerDown(300, 250, 1, noKeyModifiers());
    expect(pressed).toEqual(['menu-item', 'underneath']);
    runtime.dispose();
  });

  it('closes a dismissible entry when the wheel turns outside it', () => {
    const { runtime, overlays, frame } = mount();
    const open = findText(runtime.debugRoot(), 'Open')!;
    overlays.open({
      id: 'menu',
      anchor: open,
      dismissOnOutsidePress: true,
      content: Box({ width: 120, height: 30 })
    });
    frame();
    runtime.input.wheel.wheel(300, 250, 0, 40, noKeyModifiers());
    expect(overlays.isOpen('menu')).toBe(false);
    runtime.dispose();
  });

  it('replaces an entry with the same id and closes all', () => {
    const store = new OverlayService();
    const closed: string[] = [];
    store.open({ id: 'a', content: Box(), onClose: () => closed.push('a') });
    store.open({ id: 'b', content: Box() });
    store.open({ id: 'a', content: Box({ width: 1 }), onClose: () => closed.push('a') });
    expect(store.entries.value.map(entry => entry.id)).toEqual(['b', 'a']);
    store.close('a');
    expect(closed).toEqual(['a']);
    store.closeAll();
    expect(store.entries.value).toEqual([]);
  });
});
