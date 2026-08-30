import { input } from '../framework/Input';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { Button, Row, Text } from '../ui/composition/UiComponents';
import type { UiChild } from '../ui/composition/UiElement';
import type { UiNode } from '../ui/graph/UiNode';
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
}

export function Toast(props: Inputs<ToastProps>, ctx: ComponentContext): UiChild {
  const message = input(props.message, '');
  const tone = input(props.tone, 'info');
  const duration = input(props.duration, 4000);
  const dismissible = input(props.dismissible, true);
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
    props.onClose.value?.();
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

  props.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      overlay.show(body(), { bottom: 24, left: 24, environment: placeholder, onClose: cancel });
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
