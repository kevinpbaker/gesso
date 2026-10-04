import { map } from 'rxjs';

import {
  input,
  themeTokenCell,
  type ComponentContext,
  type Inputs,
  AnimationService,
  FocusService,
  internalState
} from 'gesso-framework';
import { Column, percent, Row, Text, type UiChild, type UiNode } from 'gesso-core';
import { keymap } from './internals';
import { controlTokens } from './tokens';
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
 *
 * **It never leaves the screen.** Like a browser's modal `<dialog>`,
 * it is at most as wide and as tall as the screen less a margin, and
 * what doesn't fit of the body scrolls under the title. Content that
 * can shrink (a scroll view with a height of its own and `minHeight`
 * 0) is given the room there is instead, and scrolls itself.
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

/** The least room left between a dialog and each edge of the screen, in pixels. */
const SCREEN_MARGIN = 16;

export function Dialog(inputs: Inputs<DialogProps>, ctx: ComponentContext): UiChild {
  const title = input(inputs.title, '');
  const description = input(inputs.description, '');
  const dismissible = input(inputs.dismissible, true);
  const width = input(inputs.width, 360);
  const focus = ctx.inject(FocusService);
  const animations = ctx.inject(AnimationService);
  const overlay = useOverlay(ctx, 'dialog');
  const tokens = themeTokenCell(controlTokens);
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

  /**
   * Every close goes through the entry, so `onClose` is reported from
   * one place: the entry's callback below. Escape, the backdrop, a
   * write of `false` and the unmount all end in `OverlayService.close`,
   * and calling the prop here as well would report each of them twice.
   */
  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
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
    Column(
      {
        // Taking the trap from the ref means it applies as soon as the
        // dialog is in the tree; the runtime settles focus into it once
        // its children exist ().
        modifiers: [tokens.modifier],
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focus.trap(node);
          }
        },
        width: width.value,
        // `width` is what it wants; a screen narrower than that gets the
        // dialog at its own width, inside the margin the overlay keeps.
        // The height is its content's, and the same goes for a screen
        // shorter than that: the body below gives up the difference.
        maxWidth: percent(100),
        maxHeight: percent(100),
        // 8 and not 12 between the parts, and 16 and not 20 at the sides
        // and the bottom: the body below has 4 of its own all round, so
        // a focus ring drawn outside a field in it isn't cut off where
        // the body clips. The title and description make up the 4.
        gap: 8,
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
        paddingTop: 20,
        paddingX: 16,
        paddingBottom: 16,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: tokens.select(t => t.radius.sheet),
        role: 'dialog',
        label: title,
        description,
        states: ['modal'],
        // The keyboard's home of last resort. A dialog whose content is
        // a sentence and nothing focusable used to hand the keyboard to
        // nothing when the trap settled, and Escape had nowhere to be
        // delivered: the one thing a modal must always answer could not
        // be reached without a mouse. The body takes focus when nothing
        // inside it will.
        //
        // `tabStop: false` is the other half and is not optional. Without
        // it every dialog gains a stop in its own Tab cycle, on a box
        // that announces nothing and does nothing.
        focusable: true,
        tabStop: false,
        onKeyDown: keymap(dismissible.value ? { Escape: close } : {})
      },
      // The title and description keep their height; only the body
      // gives way on a short screen, so what the dialog is stays in view.
      title.pipe(
        map(text =>
          text.length === 0
            ? []
            : [Text({ text, color: 'text', fontSize: 18, fontWeight: 600, paddingX: 4, flexShrink: 0 })]
        )
      ),
      description.pipe(
        map(text =>
          text.length === 0
            ? []
            : [Text({ text, color: 'textMuted', fontSize: 13, paddingX: 4, paddingTop: 4, flexShrink: 0 })]
        )
      ),
      Column(
        {
          // The dialog's width, inside its padding: content that asks for
          // 100% means the dialog, not whatever the title happens to need.
          width: percent(100),
          // What's left of the dialog's height, scrolling what doesn't
          // fit. A flex column rather than a scroll view, so content that
          // may shrink is offered that height rather than all it asks for.
          flexShrink: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 4
        },
        inputs.content.value ?? Row()
      )
    );

  // Opening and closing follow the `open` prop: a dialog is controlled
  // by whoever owns the reason it is open.
  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      // Reset before the tree is built, so the first frame the dialog
      // is on screen is the one it starts from rather than a frame of
      // the previous opening's final state.
      enter.value = 0;
      overlay.show(body(), {
        // Centred in the canvas on both axes.
        //
        // A dialog that grows after it opens moves on both axes, which
        // is the trade for the position a modal is expected in.
        center: 'both',
        // A margin on every side, which is what stops a dialog wider
        // than a phone, or taller than a short window, from meeting its
        // edges: the dialog is at most the size of what's between.
        top: SCREEN_MARGIN,
        right: SCREEN_MARGIN,
        bottom: SCREEN_MARGIN,
        left: SCREEN_MARGIN,
        environment: placeholder,
        dismissOnOutsidePress: dismissible.value,
        // The backdrop is there either way: `dismissible` decides only
        // whether a press on it closes the dialog. Without one, a press
        // beside a dialog that can't be dismissed reached the page.
        modal: true,
        onClose: () => {
          release();
          inputs.onClose.value?.();
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
