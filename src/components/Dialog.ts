import { map } from 'rxjs';

import { input } from '../framework/Input';
import type { ComponentContext, Inputs } from '../framework/FunctionComponent';
import { FocusStore } from '../framework/app/FocusStore';
import { Box, Column, Row, Text } from '../ui/composition/UiComponents';
import type { UiChild } from '../ui/composition/UiElement';
import type { UiNode } from '../ui/graph/UiNode';
import { keymap } from './internals';
import { useOverlay } from './overlay';

/**
 * A window that takes over the keyboard.
 *
 * Modal in the only sense that matters: while it is open, focus cannot
 * leave it (`FocusStore.trap`), and closing hands the keyboard back to
 * whatever opened it. Both halves are the runtime's — C0 built them —
 * so this component is the shape and the lifecycle, not the mechanism.
 *
 * **Escape closes the topmost dialog and no other.** It is bound on
 * the dialog's own content, and focus is inside the innermost trap, so
 * the key never reaches a dialog underneath. Nothing has to know about
 * a stack.
 */
export interface DialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  /** The body. Buttons and fields go here. */
  content?: UiChild;
  /** Escape and the backdrop close it. Both default on. */
  dismissible?: boolean;
  width?: number;
}

export function Dialog(props: Inputs<DialogProps>, ctx: ComponentContext): UiChild {
  const title = input(props.title, '');
  const description = input(props.description, '');
  const dismissible = input(props.dismissible, true);
  const width = input(props.width, 360);
  const focus = ctx.inject(FocusStore);
  const overlay = useOverlay(ctx, 'dialog');
  let trapped = false;
  let placeholder: UiNode | null = null;

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
    props.onClose.value?.();
  };

  /** The trap is released here rather than in `close`, so a dialog that closes because it unmounted releases too. */
  const release = (): void => {
    if (trapped) {
      trapped = false;
      focus.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  const body = (): UiChild =>
    Box(
      {
        // Taking the trap from the ref means it applies as soon as the
        // dialog is in the tree; the runtime settles focus into it once
        // its children exist (see decisions/0020-focus-scopes.md).
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focus.trap(node);
          }
        },
        width: width.value,
        padding: 20,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 12,
        role: 'dialog',
        label: title,
        description,
        states: ['modal'],
        onKeyDown: keymap(dismissible.value ? { Escape: close } : {})
      },
      Column(
        { gap: 12 },
        title.pipe(
          map(text => (text.length === 0 ? [] : [Text({ text, color: 'text', fontSize: 18, fontWeight: 600 })]))
        ),
        description.pipe(map(text => (text.length === 0 ? [] : [Text({ text, color: 'textMuted', fontSize: 13 })]))),
        props.content.value ?? Row()
      )
    );

  // Opening and closing follow the `open` prop: a dialog is controlled
  // by whoever owns the reason it is open.
  props.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      overlay.show(body(), {
        top: 80,
        environment: placeholder,
        dismissOnOutsidePress: dismissible.value,
        onClose: () => {
          release();
          props.onClose.value?.();
        }
      });
    } else if (isOpen !== true && overlay.isOpen()) {
      overlay.hide();
    }
  });

  // The dialog itself lives in the overlay layer; nothing is rendered
  // where it was declared.
  // The placeholder stays where the component was declared, which
  // is how the overlay's content inherits this tree's theme.
  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
}
