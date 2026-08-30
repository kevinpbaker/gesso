import { describe, expect, it } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { Box, Button, Column, type UiElement, type UiNode } from '@gesso/core';
import { OverlayService } from '../overlay/OverlayService';
import { FocusService } from './FocusService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * A page with two buttons and a dialog it opens as an overlay.
 *
 * The dialog is the shape F3's `Dialog` will have: it traps focus in
 * its own subtree while it is open, and releasing hands the keyboard
 * back to the button that opened it. Everything here goes through
 * `FocusService`, because that is all a component can reach.
 */
let host: FocusHostApp | null = null;

/** The mounted instance, so a test can drive the app's own methods. */
function register(instance: FocusHostApp): void {
  host = instance;
}

@Define('focus-host-app')
class FocusHostApp extends Component {
  @Inject(OverlayService) overlays!: OverlayService;
  @Inject(FocusService) focus!: FocusService;

  opener: UiNode | null = null;
  dialog: UiNode | null = null;

  openDialog(): void {
    this.overlays.open({
      id: 'dialog',
      top: 40,
      left: 40,
      content: Box(
        {
          ref: (node: UiNode | null) => {
            this.dialog = node;
            if (node !== null) {
              this.focus.trap(node);
            }
          },
          width: 200,
          height: 80
        },
        Button({ width: 100, height: 30, text: 'Confirm' }),
        Button({ width: 100, height: 30, text: 'Cancel' })
      )
    });
  }

  closeDialog(): void {
    this.overlays.close('dialog');
  }

  constructor() {
    super();
    register(this);
  }

  override render(): UiElement {
    return Column(
      { padding: 10, gap: 10 },
      Button({
        ref: (node: UiNode | null) => {
          this.opener = node;
        },
        width: 80,
        height: 30,
        text: 'Open'
      }),
      Button({ width: 80, height: 30, text: 'Other' })
    );
  }
}

/** A field that asks for focus from its own ref, during the first build. */
@Define('autofocus-app')
class AutoFocusApp extends Component {
  @Inject(FocusService) focus!: FocusService;

  override render(): UiElement {
    return Column(
      Button({ width: 80, height: 30, text: 'First' }),
      Button({
        ref: (node: UiNode | null) => {
          if (node !== null) {
            this.focus.focus(node);
          }
        },
        width: 80,
        height: 30,
        text: 'Second'
      })
    );
  }
}

function mount(App: new () => Component) {
  host = null;
  const mounted = mountRuntime(createComponent(App), { width: 400, height: 300 });
  mounted.frame(0);
  return { ...mounted, store: mounted.runtime.services.get(FocusService) };
}

/** The mounted `FocusHostApp`; only the tests that use one call this. */
function app(): FocusHostApp {
  if (host === null) {
    throw new Error('no FocusHostApp is mounted');
  }
  return host;
}

function texts(nodes: readonly UiNode[]): string[] {
  return nodes.map(node => String(node.properties.get('text')));
}

describe('FocusService', () => {
  it('is registered by every runtime and follows the focused node', () => {
    const { runtime, store } = mount(FocusHostApp);

    expect(store.focused.value).toBeNull();
    runtime.input.keyboard.keyDown('Tab');

    expect(runtime.input.focus.focusedNode).toBe(app().opener);
    expect(store.focused.value).toBe(app().opener);
  });

  it('replays a focus taken before the runtime installed the manager', () => {
    const { runtime, store } = mount(AutoFocusApp);

    // The ref fired during the first build, before `createInput`.
    expect(store.focused.value).not.toBeNull();
    expect(runtime.input.focus.focusedNode?.properties.get('text')).toBe('Second');
  });

  it('traps the keyboard in the dialog and wraps inside it', () => {
    const { runtime, frame, store } = mount(FocusHostApp);
    runtime.input.keyboard.keyDown('Tab');
    expect(store.focused.value).toBe(app().opener);

    app().openDialog();
    frame();

    expect(store.trapped.value).toBe(true);
    const visited: UiNode[] = [runtime.input.focus.focusedNode!];
    runtime.input.keyboard.keyDown('Tab');
    visited.push(runtime.input.focus.focusedNode!);
    runtime.input.keyboard.keyDown('Tab');
    visited.push(runtime.input.focus.focusedNode!);

    expect(texts(visited)).toEqual(['Confirm', 'Cancel', 'Confirm']);
  });

  it('releasing the trap returns focus to the opener', () => {
    const { runtime, frame, store } = mount(FocusHostApp);
    runtime.input.keyboard.keyDown('Tab');
    app().openDialog();
    frame();

    store.releaseTrap();

    expect(store.trapped.value).toBe(false);
    expect(runtime.input.focus.focusedNode).toBe(app().opener);
    expect(store.focused.value).toBe(app().opener);
  });

  it('closing the dialog releases the trap and restores the opener', () => {
    const { runtime, frame, store } = mount(FocusHostApp);
    runtime.input.keyboard.keyDown('Tab');
    app().openDialog();
    frame();
    expect(store.trapped.value).toBe(true);

    // No releaseTrap: the component just unmounts, as a closing dialog
    // does. The graph's removal reaches the focus manager.
    app().closeDialog();
    frame();

    expect(store.trapped.value).toBe(false);
    expect(runtime.input.focus.focusedNode).toBe(app().opener);
  });

  it('keeps focus out of the page while the dialog is open', () => {
    const { runtime, frame } = mount(FocusHostApp);
    app().openDialog();
    frame();

    expect(runtime.input.focus.focus(app().opener!)).toBe(false);
    expect(runtime.input.focus.focusedNode?.properties.get('text')).toBe('Confirm');
  });
});
