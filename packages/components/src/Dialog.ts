import { map } from 'rxjs';

import {
  input,
  type ComponentContext,
  type Inputs,
  AnimationService,
  FocusService,
  internalState
} from '@gesso/framework';
import { Box, Column, Row, Text, type UiChild, type UiNode } from '@gesso/core';
import { keymap } from './internals';
import { useOverlay } from './overlay';

/**
 * A window that takes over the keyboard.
 *
 * Modal in the only sense that matters: while it is open, focus cannot
 * leave it (`FocusService.trap`), and closing hands the keyboard back to
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
  const focus = ctx.inject(FocusService);
  const animations = ctx.inject(AnimationService);
  const overlay = useOverlay(ctx, 'dialog');
  let trapped = false;
  let placeholder: UiNode | null = null;
  /**
   * How far in the dialog is: 0 as it mounts, 1 when it has arrived.
   *
   * One cell for both halves of the entrance, so opacity and scale
   * cannot disagree, and one animation rather than two. Both are paint
   * properties, so a frame of the entrance costs a repaint and no
   * layout at all.
   */
  const enter = internalState(0);

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
        opacity: enter,
        // `x` and `y` are the pivot, not a translation (see
        // `UiTransform`). Half the width puts it on the dialog's
        // vertical axis, which is what a centred dialog wants.
        //
        // `y` stays 0 — the top edge — because the pivot is in logical
        // pixels and a dialog's height is its content's, not known
        // where the transform is declared. The entrance scales 0.96 to
        // 1, so the difference between growing from the top edge and
        // from the middle is 2% of the height: two or three pixels,
        // over the whole entrance. Reading the measured box back to
        // close that gap would cost a layout round trip per frame.
        transform: enter.pipe(
          map(t => ({ x: width.value / 2, y: 0, scaleX: 0.96 + 0.04 * t, scaleY: 0.96 + 0.04 * t }))
        ),
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
      // Reset before the tree is built, so the first frame the dialog
      // is on screen is the one it starts from rather than a frame of
      // the previous opening's final state.
      enter.value = 0;
      overlay.show(body(), {
        // Centred in the canvas on both axes.
        //
        // A dialog that grows after it opens moves on the axis it is
        // centred on, and one taller than the canvas overflows both
        // ends rather than just the bottom — so the edges of a centred
        // dialog are the caller's problem to keep modest. That is the
        // trade for the position a modal is expected in.
        center: 'both',
        environment: placeholder,
        dismissOnOutsidePress: dismissible.value,
        onClose: () => {
          release();
          props.onClose.value?.();
        }
      });
      // Started after `show`, so the node the binding writes exists.
      // Under reduced motion this writes 1 here and completes, and the
      // dialog is simply present — the end state is identical, which
      // is the whole argument for snapping rather than skipping.
      animations.animate(enter, 1, { duration: 'slow', easing: 'decelerate' });
    } else if (isOpen !== true && overlay.isOpen()) {
      overlay.hide();
    }
  });
  // The cell outlives the overlay's nodes — the component owns it —
  // so the animation has to be stopped with the component and not with
  // the tree it was writing into.
  ctx.onUnmount(() => animations.stop(enter));

  // The dialog itself lives in the overlay layer; nothing is rendered
  // where it was declared.
  // The placeholder stays where the component was declared, which
  // is how the overlay's content inherits this tree's theme.
  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
}
