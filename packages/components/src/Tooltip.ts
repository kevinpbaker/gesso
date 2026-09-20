import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { Box, Text, UiEventType, defineModifier, type UiChild, type UiModifier, type UiNode } from 'gesso-core';
import { useOverlay, type OverlayHandle, type OverlayPlacement } from './overlay';

/**
 * The box a tooltip is, wherever it is opened from.
 *
 * The component below and `tooltip()`, the modifier in `tooltip.ts`,
 * both open this. They are one
 * implementation with two surfaces, and this function is the seam that
 * keeps them from drifting into two tooltips that look different.
 */
export function tooltipContent(text: string): UiChild {
  return Box(
    {
      padding: 6,
      backgroundColor: 'controlForeground',
      borderRadius: 4,
      maxWidth: 220,
      // A tooltip must never take a hit: the pointer is on its way
      // to the thing underneath.
      pointerEvents: 'none',
      role: 'tooltip',
      label: text
    },
    Text({ text, color: 'controlBackground', fontSize: 12, selectable: false })
  );
}

/**
 * A label that appears beside something after a pause.
 *
 * It wraps its trigger rather than taking an anchor, because it has to
 * listen to that element's pointer and focus, and a component cannot
 * add listeners to a node it does not render. `tooltip()`, below,
 * is the modifier that does, and the two share `tooltipContent` rather
 * than growing a second implementation.
 * Prefer the modifier; this remains for a trigger that is a plain
 * child rather than an element the caller controls.
 *
 * It never takes focus: a tooltip that could be tabbed into would be a
 * trap with no way out. It is described, not visited.
 */
export interface TooltipProps {
  text?: string;
  placement?: OverlayPlacement;
  /** Milliseconds the pointer must rest before it opens. */
  delay?: number;
  children?: UiChild;
}

export function Tooltip(inputs: Inputs<TooltipProps>, ctx: ComponentContext): UiChild {
  const text = input(inputs.text, '');
  const placement = input(inputs.placement, 'top');
  const delay = input(inputs.delay, 400);
  const overlay = useOverlay(ctx, 'tooltip');
  let anchor: UiNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  ctx.onUnmount(cancel);

  const show = (): void => {
    if (text.value.length === 0 || overlay.isOpen()) {
      return;
    }
    overlay.show(tooltipContent(text.value), { anchor, placement: placement.value, offset: 6 });
  };

  const hide = (): void => {
    cancel();
    overlay.hide();
  };

  return Box(
    {
      ref: (node: UiNode | null) => (anchor = node),
      onPointerEnter: () => {
        cancel();
        timer = setTimeout(show, delay.value);
      },
      onPointerLeave: hide,
      onPointerDown: hide,
      // Keyboard users get it too: a tooltip that only answers to a
      // pointer is a tooltip half the people cannot read.
      onFocus: show,
      onBlur: hide
    },
    inputs.children.value ?? Text({ text: '' })
  );
}

export interface TooltipModifierOptions {
  text: string;
  placement?: OverlayPlacement;
  /** Milliseconds the pointer must rest before it opens. */
  delay?: number;
}

/**
 * The same tooltip, attached to an element instead of wrapped around
 * one.
 *
 * The modifier form. It exists because the component above has
 * to wrap its trigger in a `Box` to listen to it, and a wrapper is a
 * node: it takes part in layout, it can stretch where the trigger
 * would not, and it is one more box in the tree for every label in the
 * application. A modifier listens to the element itself and adds
 * nothing to the tree.
 *
 * **Why the context is the first argument.** A modifier cannot inject
 * a service: it has no component of its own to inject into, and the
 * overlay service is per runtime. So the component that renders the
 * element hands over its own overlay entry, which is also what makes
 * the tooltip close when that component unmounts.
 *
 * The engine does the following: an anchored overlay tracks its anchor
 * through scrolls and flips at the viewport edge (L2), so nothing here
 * watches layout.
 */
export function tooltip(ctx: ComponentContext, options: TooltipModifierOptions): UiModifier<TooltipArgs> {
  return tooltipKind({ ...options, overlay: useOverlay(ctx, 'tooltip') });
}

/** What `tooltip()` builds: the options, plus the component's overlay entry. */
export interface TooltipArgs extends TooltipModifierOptions {
  readonly overlay: OverlayHandle;
}

const tooltipKind = defineModifier<TooltipArgs>({
  name: 'tooltip',
  attach(host, args) {
    let current = args;
    let timer: ReturnType<typeof setTimeout> | null = null;
    tooltipArgs.set(host, next => {
      current = next;
      // An open tooltip whose text changed is reopened with the new
      // text rather than left showing the old one; a closed one is
      // left closed, because a re-render is not a hover.
      if (current.overlay.isOpen()) {
        open();
      }
    });

    const cancel = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const open = (): void => {
      if (current.text.length === 0) {
        return;
      }
      current.overlay.show(tooltipContent(current.text), {
        anchor: host.node,
        placement: current.placement ?? 'top',
        offset: 6
      });
    };
    const show = (): void => {
      if (current.overlay.isOpen()) {
        return;
      }
      open();
    };
    const hide = (): void => {
      cancel();
      current.overlay.hide();
    };

    host.on(UiEventType.PointerEnter, () => {
      cancel();
      timer = setTimeout(show, current.delay ?? 400);
    });
    host.on(UiEventType.PointerLeave, hide);
    host.on(UiEventType.PointerDown, hide);
    // Keyboard users get it too: a tooltip that only answers to a
    // pointer is a tooltip half the people cannot read.
    host.on(UiEventType.Focus, show);
    host.on(UiEventType.Blur, hide);
    host.own(cancel);
  },
  update(host, args) {
    tooltipArgs.get(host)?.(args);
  }
});

const tooltipArgs = new WeakMap<object, (args: TooltipArgs) => void>();
