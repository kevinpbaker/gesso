import { input, type ComponentContext, type Inputs } from 'gesso-framework';
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
 * raised it.
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
  /** Which part of the bottom edge it's pinned to. */
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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let placeholder: UiNode | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  ctx.onUnmount(cancel);

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
        label: message.value
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

  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      overlay.show(body(), { ...pin(placement.value, offset.value), environment: placeholder, onClose: cancel });
      if (duration.value > 0) {
        timer = setTimeout(close, duration.value);
      }
    } else if (isOpen !== true && overlay.isOpen()) {
      close();
    }
  });

  // The placeholder stays where the component was declared, which
  // is how the overlay's content inherits this tree's theme.
  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
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
