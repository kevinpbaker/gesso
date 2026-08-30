import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { Box, Text, type UiChild, type UiNode } from '@gesso/core';
import { useOverlay, type OverlayPlacement } from './overlay';

/**
 * A label that appears beside something after a pause.
 *
 * It wraps its trigger rather than taking an anchor, because it has to
 * listen to that element's pointer and focus, and a component cannot
 * add listeners to a node it does not render. A modifier can —
 * `MODIFIERS_ROADMAP.md` B4's `tooltip()` — and when it lands it
 * should open this component's overlay rather than grow a second
 * implementation (`COMPONENTS_ROADMAP.md` §6).
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

export function Tooltip(props: Inputs<TooltipProps>, ctx: ComponentContext): UiChild {
  const text = input(props.text, '');
  const placement = input(props.placement, 'top');
  const delay = input(props.delay, 400);
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
    overlay.show(
      Box(
        {
          padding: 6,
          backgroundColor: 'controlForeground',
          borderRadius: 4,
          maxWidth: 220,
          // A tooltip must never take a hit: the pointer is on its way
          // to the thing underneath.
          pointerEvents: 'none',
          role: 'tooltip',
          label: text.value
        },
        Text({ text: text.value, color: 'controlBackground', fontSize: 12, selectable: false })
      ),
      { anchor, placement: placement.value, offset: 6 }
    );
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
    props.children.value ?? Text({ text: '' })
  );
}
