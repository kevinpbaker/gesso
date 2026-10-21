import { combineLatest, map } from 'rxjs';

import {
  AnimationService,
  createComponent,
  FocusService,
  input,
  internalState,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import { Box, Column, percent, resolveString, Row, Text, type UiChild, type UiNode } from 'gesso-core';
import { Button } from './Button';
import { controlled } from './controlled';
import { keymap } from './internals';
import { useOverlay } from './overlay';

/**
 * Which edge of the window a drawer comes in from.
 *
 * `start` and `end` are the reading edges, not the physical ones: in
 * right-to-left text `start` is the right edge, which is where a
 * reader of that script looks for navigation. `top` and `bottom` have
 * nothing to mirror.
 */
export type DrawerSide = 'start' | 'end' | 'top' | 'bottom';

/**
 * A panel that slides in from an edge of the window.
 *
 * The same lifecycle as `Dialog` with a different shape: it draws into
 * the overlay layer, carries the theme of where it was declared across
 * with a placeholder, and, when modal, traps the keyboard in itself and
 * hands it back to whatever opened it. What it adds is the edge and the
 * movement. It is pinned to one edge of the window, as tall (or as wide)
 * as the window, and slides in from beyond that edge and back out again.
 *
 * **It leaves before it goes.** Closing does not take the panel out of
 * the overlay layer on the frame it is asked to: the panel slides back
 * past its edge first, and only when the slide has finished is the
 * entry removed. For that quarter of a second the panel is still drawn
 * but takes nothing: it is `disabled`, which makes it and everything in
 * it inert to the pointer, to focus and to the keyboard, and the
 * keyboard has already been handed back. A press on a button that is
 * visibly on its way out is not a press anybody meant.
 *
 * Under reduced motion both movements snap, so the panel is simply
 * there and simply gone, which is the end state either way.
 *
 * **Modal or not.** Modal (the default) is a dialog that happens to sit
 * at an edge: the page behind is dimmed and takes no presses, a press on
 * the dimmed page closes the drawer, and Tab cycles inside it. Not modal
 * is a panel beside the page: no dim, no trap, and the page around it
 * stays usable. Escape closes either, while focus is inside it.
 */
export interface DrawerProps {
  /** Whether it is open. Omit, with or without `defaultOpen`, to let the drawer own it. */
  open?: boolean;
  /** Whether it starts open, for a drawer that owns its own state. */
  defaultOpen?: boolean;
  /**
   * Called with `false` when the person closes it: Escape, the close
   * button, or a press on the dimmed page. A controlled drawer stays
   * open until `open` is written back.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Called alongside `onOpenChange(false)`, for a caller used to
   * `Dialog`'s name for the same request.
   */
  onClose?: () => void;
  /** The edge it comes in from. Default `start`. Read when it opens. */
  side?: DrawerSide;
  /**
   * Its width for `start` and `end`, its height for `top` and `bottom`,
   * in logical pixels. Default 320. Never more than the window: a 480
   * pixel drawer on a 375 pixel phone is 375 wide. Read when it opens.
   */
  size?: number;
  /**
   * Dim the page, keep it from presses and trap the keyboard. Default
   * true. Read when it opens.
   */
  modal?: boolean;
  /**
   * Escape, the close button and a press on the dimmed page close it.
   * Default true. Off leaves only what the content offers.
   */
  dismissible?: boolean;
  /** Drawn at the top, and the accessible name unless `label` says otherwise. */
  title?: string;
  /** Carried on the record as the description, and drawn under the title. */
  description?: string;
  /** The accessible name, for a drawer with no visible title. */
  label?: string;
  /** The body. It scrolls when it is taller than the room there is. */
  content?: UiChild;
}

/** The physical edge a side lands on. */
type Edge = 'left' | 'right' | 'top' | 'bottom';

export function Drawer(inputs: Inputs<DrawerProps>, ctx: ComponentContext): UiChild {
  const side = input(inputs.side, 'start');
  const size = input(inputs.size, 320);
  const modal = input(inputs.modal, true);
  const dismissible = input(inputs.dismissible, true);
  const title = input(inputs.title, '');
  const description = input(inputs.description, '');
  const label = input(inputs.label, '');
  const focus = ctx.inject(FocusService);
  const animations = ctx.inject(AnimationService);
  const open = controlled<boolean>({
    component: 'Drawer',
    name: 'open',
    source: inputs.open,
    initial: inputs.defaultOpen,
    fallback: false,
    onChange: inputs.onOpenChange
  });

  /**
   * Set before `useOverlay` registers its own unmount, so it is already
   * true when the entry is closed by the unmount: a drawer that goes
   * because its screen went does not report a close to a parent that is
   * being torn down with it.
   */
  let disposed = false;
  ctx.onUnmount(() => (disposed = true));
  const overlay = useOverlay(ctx, 'drawer');

  /**
   * How far in the drawer is: 0 beyond its edge, 1 in place.
   *
   * One cell drives the slide and the dim together, so the two cannot
   * disagree, and both are paint properties: a frame of the movement
   * costs a repaint and no layout.
   */
  const slide = internalState(0);
  /** True from the moment it is asked to close until it has left. */
  const leaving = internalState(false);
  /**
   * Whether the panel itself may hold focus, false until its trap is
   * taken.
   *
   * The trap is taken from the panel's ref, which fires before the
   * panel's children exist, so at that moment the only thing in the
   * scope that could take focus is the panel. Had it been focusable it
   * would have kept focus, and the person would land on the box rather
   * than on its first control. Unfocusable for that instant, the trap
   * finds nothing, and the runtime settles focus into it again once the
   * frame's tree is built, when the controls are there; a drawer with
   * none falls back to the panel, which by then may hold it.
   */
  const ready = internalState(false);
  /** The panel's node, from its ref. */
  let panel: UiNode | null = null;
  /** The panel's node while focus is trapped in it. */
  let trapped: UiNode | null = null;
  /** What held focus when a non-modal drawer opened, to give it back to. */
  let opener: UiNode | null = null;
  let placeholder: UiNode | null = null;
  let mounted = false;
  /** Whether the opening in progress is modal; `modal` is read once per opening. */
  let shownModal = true;

  /** The person asking it to close. A controlled drawer waits for `open` to follow. */
  const requestClose = (): void => {
    if (!open.current() || leaving.value) {
      return;
    }
    open.change(false);
    inputs.onClose.value?.();
  };

  /**
   * Its own trap, by name, and not whichever is innermost: a drawer
   * closed by its owner while a menu or a dialog sits over it must leave
   * that one holding the keyboard. The same rule `Dialog` keeps.
   */
  const release = (): void => {
    if (trapped !== null) {
      const scope = trapped;
      trapped = null;
      focus.releaseTrap(scope);
    }
  };
  ctx.onUnmount(release);

  /**
   * Hands the keyboard back as the drawer starts to leave rather than
   * when it has gone, so nothing typed during the slide lands in it.
   *
   * A modal drawer's trap remembers its own opener. A non-modal one has
   * no trap, so it gives focus back itself, and only when focus is in
   * the drawer: someone who has already moved on to the page keeps
   * their place.
   */
  const handBack = (): void => {
    if (trapped !== null) {
      release();
      return;
    }
    const at = focus.focused.value;
    if (panel !== null && at !== null && contains(panel, at)) {
      if (opener !== null && opener.parent !== null) {
        focus.focus(opener);
      } else {
        focus.blur();
      }
    }
  };

  /** Puts the keyboard in the panel, by a trap or by plain focus. */
  const takeKeyboard = (node: UiNode): void => {
    if (shownModal) {
      if (trapped === null) {
        trapped = node;
        focus.trap(node);
      }
      ready.value = true;
    } else {
      ready.value = true;
      focus.focus(node);
    }
  };

  const enter = (): void => {
    if (!mounted) {
      return;
    }
    if (overlay.isOpen()) {
      // Asked open again while it was sliding out: it turns round where
      // it is, rather than finishing the exit and starting over.
      if (leaving.value) {
        leaving.value = false;
        if (panel !== null) takeKeyboard(panel);
        animations.animate(slide, 1, { duration: 'normal', easing: 'decelerate' });
      }
      return;
    }
    opener = focus.focused.value;
    shownModal = modal.value;
    // The direction is read where the drawer was declared, the same
    // node the overlay layer takes its theme and direction from (it is
    // the entry's `environment` below), and decides which physical edge
    // `start` and `end` name.
    const rtl = placeholder !== null && resolveString(placeholder, 'textDirection') === 'rtl';
    const edge = edgeOf(side.value, rtl);
    // Reset before the tree is built, so the first frame is the panel
    // beyond its edge and not wherever a previous opening left it.
    slide.value = 0;
    leaving.value = false;
    ready.value = false;
    overlay.show(body(edge, rtl, size.value, shownModal), {
      // Stretched over the whole window and not hit-testable itself, as
      // `center` makes it: the content below positions the panel at its
      // edge inside that box, and a press beside the panel goes past it.
      center: 'both',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      environment: placeholder,
      // The layer's backdrop keeps the page from presses; it closes
      // nothing, because a close has to slide out first. The dim is the
      // drawer's own, below, so it can fade out with the panel too.
      modal: shownModal,
      scrim: false,
      dismissOnOutsidePress: false,
      onClose: () => {
        release();
        animations.stop(slide);
        leaving.value = false;
        panel = null;
        // Closed by something other than the slide finishing (another
        // part of the app closing every overlay): the state follows.
        if (!disposed && open.current()) {
          open.change(false);
          inputs.onClose.value?.();
        }
      }
    });
    // Started after `show`, so the nodes it writes into exist. Under
    // reduced motion it writes 1 and completes.
    animations.animate(slide, 1, { duration: 'normal', easing: 'decelerate' });
  };

  const leave = (): void => {
    if (!overlay.isOpen() || leaving.value) {
      return;
    }
    leaving.value = true;
    handBack();
    animations.animate(slide, 0, { duration: 'normal', easing: 'accelerate' }).subscribe({
      // Completion also means superseded: an opening that turned it
      // round ends this animation too, and must not lose the entry.
      complete: () => {
        if (leaving.value && slide.value === 0) {
          overlay.hide();
        }
      }
    });
  };

  const name = combineLatest([label, title]).pipe(map(([given, heading]) => (given !== '' ? given : heading)));

  function body(edge: Edge, rtl: boolean, length: number, isModal: boolean): UiChild {
    const horizontal = edge === 'left' || edge === 'right';
    /**
     * Pinned to its edge and stretched along it. `size` is what it
     * wants across; `maxWidth` / `maxHeight` of the whole window is
     * the clamp, so a drawer never runs off the far side.
     */
    const placement = horizontal
      ? { top: 0, bottom: 0, [edge]: 0, width: length, maxWidth: percent(100) }
      : { left: 0, right: 0, [edge]: 0, height: length, maxHeight: percent(100) };
    /**
     * Out by its whole requested size. On a window narrower than that,
     * the panel is narrower than `length` and travels further than it
     * needs to, which only shortens the visible part of the slide.
     */
    const sign = edge === 'left' || edge === 'top' ? -1 : 1;
    const transform = slide.pipe(
      map(t => {
        // Written so that at rest it is 0 and not -0, which a reader of
        // the transform would otherwise see as a movement.
        const away = sign < 0 ? (t - 1) * length : (1 - t) * length;
        return horizontal
          ? { x: 0, y: 0, translateX: away, scaleX: 1, scaleY: 1 }
          : { x: 0, y: 0, translateY: away, scaleX: 1, scaleY: 1 };
      })
    );

    return Box(
      {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        // A box the size of the window that is not itself pressable: a
        // non-modal drawer's page stays reachable beside the panel.
        hitTestable: false,
        textDirection: rtl ? 'rtl' : 'ltr'
      },
      isModal
        ? Box({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'scrim',
            // Fades with the slide. At 0 it is inert, and the layer's
            // backdrop under it still keeps the page from the press.
            opacity: slide,
            onPointerDown: () => {
              if (dismissible.value) requestClose();
            }
          })
        : Row({ width: 0, height: 0 }),
      Column(
        {
          ...placement,
          position: 'absolute',
          ref: (node: UiNode | null) => {
            if (node === null) {
              return;
            }
            panel = node;
            // As soon as it is in the tree: the runtime settles focus
            // into a trap once its children exist.
            takeKeyboard(node);
          },
          transform,
          disabled: leaving,
          backgroundColor: 'surface',
          borderColor: 'border',
          borderWidth: 1,
          role: 'dialog',
          label: name,
          description,
          states: isModal ? ['modal'] : [],
          // The keyboard's home of last resort, as it is in `Dialog`: a
          // drawer with nothing focusable in it can still hear Escape.
          // `tabStop: false` keeps it out of its own Tab cycle. See
          // `ready` for why it is not focusable from the start.
          focusable: ready,
          tabStop: false,
          onKeyDown: keymap(dismissible.value ? { Escape: requestClose } : {})
        },
        header(),
        Column(
          {
            // What is left of the panel's length, scrolling what does
            // not fit. 4 pixels of its own all round so a focus ring
            // drawn outside a field at its edge is not cut where this
            // clips; the 12 beside it makes up the 16 of the header.
            width: percent(100),
            flexGrow: 1,
            flexShrink: 1,
            minHeight: 0,
            overflow: 'auto',
            paddingX: 12,
            paddingBottom: 12,
            paddingTop: 4
          },
          Column({ width: percent(100), padding: 4 }, inputs.content.value ?? Row())
        )
      )
    );
  }

  /** The title, the description and the close button, or nothing at all when there are none. */
  function header(): UiChild {
    const heading = title.value;
    const said = description.value;
    const closable = dismissible.value;
    if (heading === '' && said === '' && !closable) {
      return Row({ width: 0, height: 0 });
    }
    return Row(
      { width: percent(100), gap: 8, paddingTop: 12, paddingX: 16, paddingBottom: 4, y: 'start', flexShrink: 0 },
      Column(
        { flexGrow: 1, flexShrink: 1, gap: 4, paddingTop: 4 },
        title.pipe(
          map(text => (text === '' ? [] : [Text({ text, color: 'text', textStyle: 'title', textWrap: 'word' })]))
        ),
        description.pipe(
          map(text => (text === '' ? [] : [Text({ text, color: 'textMuted', textStyle: 'body', textWrap: 'word' })]))
        )
      ),
      closable
        ? createComponent(Button, {
            // The pointer's way out, which on a phone, where the drawer
            // can be the whole width of the window, is the only one.
            label: 'Close',
            variant: 'plain',
            size: 'small',
            onClick: requestClose,
            // A size rather than a role: the ✕ is the button's icon.
            children: Text({ text: '✕', color: 'textMuted', fontSize: 14 })
          })
        : Row({ width: 0, height: 0 })
    );
  }

  // Opening and closing follow `open`. An opening asked for before the
  // placeholder is in the tree waits for the mount, or the overlay would
  // inherit no theme and no direction.
  ctx.onMount(() => {
    mounted = true;
    if (open.current()) enter();
  });
  ctx.effect(open.value, isOpen => (isOpen ? enter() : leave()));
  // The cell outlives the overlay's nodes, so its animation stops with
  // the component and not with the tree it was writing into.
  ctx.onUnmount(() => animations.stop(slide));

  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
}

/** The physical edge a side is on, in the direction the drawer was declared in. */
function edgeOf(side: DrawerSide, rtl: boolean): Edge {
  switch (side) {
    case 'top':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'end':
      return rtl ? 'left' : 'right';
    default:
      return rtl ? 'right' : 'left';
  }
}

function contains(root: UiNode, node: UiNode): boolean {
  for (let at: UiNode | null = node; at !== null; at = at.parent) {
    if (at === root) {
      return true;
    }
  }
  return false;
}
