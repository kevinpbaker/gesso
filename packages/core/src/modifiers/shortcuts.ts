import type { UiNode } from '../graph/UiNode';
import { UiEventType, type UiKeyboardEvent, type UiPointerEvent } from '../input/UiInputEvent';
import type { UiShortcut, UiShortcutRegistry } from '../input/UiShortcuts';
import { defineModifier, type UiModifier } from './UiModifier';
import type { UiModifierHost } from './UiModifierHost';

export interface ShortcutsOptions {
  /** The registry every `shortcut` on this page registers into. */
  readonly registry: UiShortcutRegistry;
}

/**
 * Feeds keyboard input to a shortcut registry.
 *
 * Put it on the application's root element, once. It listens at the
 * graph root in the **bubble** phase, which is the whole of the design:
 * a key reaches the registry only after the focused node and everything
 * above it have had it, so a text field that handles its own Escape
 * keeps it and a dialog that takes Enter keeps that, with no list of
 * exceptions anywhere in the registry.
 *
 * A key a shortcut takes is marked `preventDefault()`, which is what
 * `UiKeyboardController` reads before applying its own defaults, so a
 * shortcut on Tab or on Enter is not also a tab navigation or a button
 * press.
 *
 * The focused node is the event's `target`: the keyboard controller
 * routes a key to the focused node, and to the root when nothing is
 * focused, so the registry learns the scope from the event rather than
 * holding a focus manager it would otherwise need injecting.
 */
const shortcutsKind = defineModifier<ShortcutsOptions>({
  name: 'shortcuts',
  attach(host, options) {
    let registry = options.registry;
    feeds.set(host, next => (registry = next.registry));
    host.onRoot(
      UiEventType.KeyDown,
      event => {
        if (event.defaultPrevented) {
          return;
        }
        const key = event as UiKeyboardEvent;
        if (registry.handleKey(key.key, key.modifiers, key.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      { capture: false }
    );
  },
  update(host, options) {
    feeds.get(host)?.(options);
  }
});

const feeds = new WeakMap<UiModifierHost, (options: ShortcutsOptions) => void>();

export function shortcuts(options: ShortcutsOptions): UiModifier<ShortcutsOptions> {
  return shortcutsKind(options);
}

export interface ShortcutOptions extends Omit<UiShortcut, 'scope'> {
  readonly registry: UiShortcutRegistry;
  /**
   * Whether the shortcut is live only while focus is inside this node.
   * Default true, which is the point of registering it on an element
   * rather than calling `registry.register` from anywhere.
   *
   * False registers it application-wide with the element's lifetime,
   * which is what a route wants: the shortcut belongs to the screen and
   * dies with it, but works wherever the focus happens to be.
   */
  readonly scoped?: boolean;
}

/**
 * Registers one shortcut for as long as the element exists.
 *
 * The registration is undone on detach, so the lifetime of a shortcut
 * is the lifetime of the thing it acts on and a screen cannot leave a
 * command behind when it is replaced. That is the single thing a
 * root-level `onKeyDown` switching on the route cannot give you, and
 * the reason both applications' key handling grew into a function
 * nobody wanted to touch.
 */
const shortcutKind = defineModifier<ShortcutOptions>({
  name: 'shortcut',
  attach(host, options) {
    let current = options;
    entries.set(host, next => (current = next));
    const scope: UiNode | null = options.scoped === false ? null : host.node;
    host.own(
      options.registry.register({
        keys: options.keys,
        label: options.label,
        group: options.group,
        priority: options.priority,
        scope,
        // Read through the latest arguments, so a handler rebuilt every
        // render does not cost a re-registration.
        when: () => current.when?.() ?? true,
        run: () => current.run()
      })
    );
  },
  update(host, options) {
    entries.get(host)?.(options);
  }
});

const entries = new WeakMap<UiModifierHost, (options: ShortcutOptions) => void>();

export function shortcut(options: ShortcutOptions): UiModifier<ShortcutOptions> {
  return shortcutKind(options);
}

export interface ContextMenuOptions {
  /**
   * A menu was asked for on this node: the right button, or a finger
   * held on it. The point is where the pointer was, which is what a
   * `Menu`'s `at` prop takes.
   */
  readonly onOpen: (at: { readonly x: number; readonly y: number }) => void;
  /** Whether the request also stops here. Default true. */
  readonly stopPropagation?: boolean;
}

/**
 * Turns a context-menu request on this node into a callback.
 *
 * `Menu` has taken an `at` point and left the trigger to the caller
 * since it was written, with a comment saying a menu is opened by "a
 * button, a right-click or a keyboard shortcut, and the component
 * should not care which". Two of those three existed. This is the
 * third, and it is a modifier rather than a component because the thing
 * that needs the trigger is whatever the person right-clicked, not the
 * menu.
 *
 * The request stops here by default, so a row inside a list gets its
 * own menu rather than the list's; a node that wants both lets it
 * through.
 */
const contextMenuKind = defineModifier<ContextMenuOptions>({
  name: 'contextMenu',
  attach(host, options) {
    let current = options;
    menus.set(host, next => (current = next));
    host.on(UiEventType.ContextMenu, event => {
      const pointer = event as UiPointerEvent;
      if (current.stopPropagation !== false) {
        event.stopPropagation();
      }
      current.onOpen({ x: pointer.x, y: pointer.y });
    });
  },
  update(host, options) {
    menus.get(host)?.(options);
  }
});

const menus = new WeakMap<UiModifierHost, (options: ContextMenuOptions) => void>();

export function contextMenu(options: ContextMenuOptions): UiModifier<ContextMenuOptions> {
  return contextMenuKind(options);
}
