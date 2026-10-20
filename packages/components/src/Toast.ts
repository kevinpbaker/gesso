import { FocusService, input, type ComponentContext, type Inputs } from 'gesso-framework';
import { Button, Row, Text, type UiChild, type UiNode } from 'gesso-core';
import { useOverlay } from './overlay';

/**
 * A message that announces itself and goes away.
 *
 * It takes no focus — a notification that stole the keyboard from what
 * the user was doing would be a bug, not a feature — so it is read
 * through its role rather than visited: `alert` interrupts, `status`
 * waits its turn. That distinction is the only reason `tone` exists.
 *
 * Auto-dismiss is a plain timer. It is cleared when the toast closes
 * or its component unmounts, so a toast cannot outlive the screen that
 * raised it. It waits while the pointer is on the toast or focus is in
 * it, and starts again, from the whole duration, when they leave: a
 * toast must not close under somebody reading it or about to press its
 * action.
 *
 * Writing `open` true again while it is up is not a change, so it does
 * not restart the timer: an input cell passes on a value that differs
 * from the last, and there is nothing here to hear. To raise a notice
 * anew, close it first or mount a fresh toast keyed by the notice.
 */
export interface ToastProps {
  open?: boolean;
  onClose?: () => void;
  message?: string;
  /** `info` waits its turn; `error` interrupts. */
  tone?: 'info' | 'error';
  /** Milliseconds before it dismisses itself. 0 keeps it up. */
  duration?: number;
  /** Shows a button that closes it. */
  dismissible?: boolean;
  /**
   * The text of a button that does something about the notice: "Undo",
   * "Retry", "View". Pressing it calls `onAction` and closes the toast.
   */
  action?: string;
  onAction?: () => void;
  /**
   * Which part of the bottom edge it's pinned to. `bottom-start` is the
   * left corner and `bottom-end` the right, in right-to-left text as
   * well: the overlay layer places by physical edges.
   */
  placement?: ToastPlacement;
  /** Pixels between the toast and the viewport's edges. */
  offset?: number;
}

export type ToastPlacement = 'bottom-start' | 'bottom' | 'bottom-end';

export function Toast(inputs: Inputs<ToastProps>, ctx: ComponentContext): UiChild {
  const message = input(inputs.message, '');
  const tone = input(inputs.tone, 'info');
  const duration = input(inputs.duration, 4000);
  const dismissible = input(inputs.dismissible, true);
  const action = input(inputs.action, '');
  const placement = input(inputs.placement, 'bottom-start');
  const offset = input(inputs.offset, 24);
  const overlay = useOverlay(ctx, 'toast');
  const focus = ctx.inject(FocusService);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let placeholder: UiNode | null = null;
  /** The toast's node while it is up. */
  let shown: UiNode | null = null;
  /** Whether the pointer is on it, and whether focus is in it: either holds the timer. */
  let pointed = false;
  let focused = false;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  ctx.onUnmount(cancel);

  /** The whole duration from now, unless it is being read. */
  const start = (): void => {
    cancel();
    if (overlay.isOpen() && duration.value > 0 && !pointed && !focused) {
      timer = setTimeout(close, duration.value);
    }
  };

  // Focus in it is followed through the service and not the toast's own
  // events: the buttons take it, and a focus event does not bubble.
  ctx.effect(focus.focused, node => {
    const inside = shown !== null && contains(shown, node);
    if (inside !== focused) {
      focused = inside;
      if (inside) cancel();
      else start();
    }
  });

  const close = (): void => {
    cancel();
    overlay.hide();
    inputs.onClose.value?.();
  };

  const act = (): void => {
    inputs.onAction.value?.();
    close();
  };

  const body = (): UiChild =>
    Row(
      {
        y: 'center',
        gap: 12,
        padding: 12,
        minWidth: 240,
        backgroundColor: 'surface',
        borderWidth: 1,
        borderColor: tone.value === 'error' ? 'danger' : 'border',
        borderRadius: 8,
        role: tone.value === 'error' ? 'alert' : 'status',
        label: message.value,
        ref: (node: UiNode | null) => (shown = node),
        onPointerEnter: () => {
          pointed = true;
          cancel();
        },
        onPointerLeave: () => {
          pointed = false;
          start();
        }
      },
      Text({
        text: message,
        color: tone.value === 'error' ? 'danger' : 'text',
        fontSize: 13,
        flexGrow: 1,
        selectable: false
      }),
      // An ordinary button, so it's a tab stop after the screen's own
      // controls, like the ✕ beside it.
      action.value === ''
        ? Row({ width: 0 })
        : Button({
            text: action.value,
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 4,
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            color: 'primary',
            role: 'button',
            label: action.value,
            onClick: act
          }),
      dismissible.value
        ? Button({
            text: '✕',
            padding: 4,
            borderRadius: 4,
            color: 'textMuted',
            role: 'button',
            label: 'Dismiss',
            onClick: close
          })
        : Row({ width: 0 })
    );

  let wanted = false;
  const sync = (): void => {
    if (wanted && !overlay.isOpen()) {
      // A toast declared open runs this before its placeholder exists,
      // and opened then it would take no theme: it waits for it.
      if (placeholder === null) {
        return;
      }
      // Neither is on a toast that has only now appeared; a pointer
      // that left one as it closed was not heard leaving.
      pointed = false;
      focused = false;
      overlay.show(body(), { ...pin(placement.value, offset.value), environment: placeholder, onClose: cancel });
      start();
    } else if (!wanted && overlay.isOpen()) {
      close();
    }
  };
  inputs.open.subscribe(isOpen => {
    wanted = isOpen === true;
    sync();
  });

  // The placeholder stays where the component was declared, which
  // is how the overlay's content inherits this tree's theme.
  return Row({
    ref: (node: UiNode | null) => {
      placeholder = node;
      sync();
    },
    visible: false,
    width: 0,
    height: 0
  });
}

/** Where on the bottom edge the overlay layer puts a toast. */
function pin(placement: ToastPlacement, offset: number) {
  switch (placement) {
    case 'bottom':
      return { bottom: offset, center: 'x' as const };
    case 'bottom-end':
      return { bottom: offset, right: offset };
    default:
      return { bottom: offset, left: offset };
  }
}

function contains(root: UiNode, node: UiNode | null): boolean {
  for (let at = node; at !== null; at = at.parent) {
    if (at === root) {
      return true;
    }
  }
  return false;
}
