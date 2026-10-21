import { distinctUntilChanged } from 'rxjs';
import {
  input,
  themeTokenCell,
  type ComponentContext,
  type Inputs,
  type OverlayPlacement,
  FocusService
} from 'gesso-framework';
import {
  Column,
  Row,
  UiEventType,
  clickOutside,
  defineModifier,
  isNodeTabStop,
  type UiChild,
  type UiInputEvent,
  type UiKeyboardEvent,
  type UiNode,
  type UiNodeRef
} from 'gesso-core';
import { controlled } from './controlled';
import { keymap } from './internals';
import { useOverlay } from './overlay';
import { controlTokens } from './tokens';

/** The side of the anchor a popover opens on. `start` and `end` follow the reading direction. */
export type PopoverSide = 'bottom' | 'top' | 'start' | 'end';

/** Which edge of the anchor the popover lines up with, along the side it opens on. */
export type PopoverAlign = 'start' | 'center' | 'end';

/**
 * A panel anchored to the control that opened it, which the page
 * behind stays usable around.
 *
 * For a filter panel, a short form beside the thing it edits, or the
 * "more about this" that is too long for a tooltip. It is a non-modal
 * dialog in ARIA's sense: it takes focus when it opens, but it does not
 * trap it, it puts no backdrop over the page, and a press anywhere
 * outside it closes it and still lands on whatever was pressed. When
 * the next thing the user does has to be answering it, that is a
 * `Dialog`; when it is a list of commands, a `Menu`.
 *
 * **The anchor is a node, as `Menu`'s is.** The caller renders its own
 * trigger, of whatever kind, and hands its node over through a `ref`
 * written into a cell. `Tooltip`'s other shape, wrapping the trigger
 * as a child, was the alternative and is the wrong one here: the
 * wrapper is a node of its own, and the trigger's `expanded` state and
 * its `controls` relation belong on the button a screen reader is on,
 * not on a box around it.
 *
 * Unlike `Menu`, the popover listens to its anchor's presses itself:
 * a click on the anchor, from the pointer, Enter or Space, or an
 * assistive technology, asks for the popover to open, or to close when
 * it is open. That is what makes `defaultOpen` worth having, since a
 * self-managing popover nobody else can open would be no use; and it
 * means the trigger needs no `onClick` of its own for this. One that
 * also toggled the popover would toggle it twice.
 *
 * **Opening moves focus in.** To `initialFocus` when it names a node
 * inside the panel that can take focus, and otherwise to the panel
 * itself, which holds focus without being a tab stop, as a `Dialog`
 * body does. Escape closes it and puts focus back on the anchor.
 *
 * **Tab leaves it, and leaving closes it.** Tab past the last control
 * in the panel goes on to whatever follows the anchor in the page, and
 * Shift+Tab before the first goes back to the anchor; either way the
 * popover asks to close. The APG's guidance for a non-modal dialog
 * allows either keeping it open or closing it; this closes, because
 * the panel is drawn in the overlay layer and not where the anchor is,
 * so a popover left open behind the focus is one the keyboard cannot
 * get back into except through the anchor, which would close it. The
 * Tab order inside the panel is the panel's own and does not wrap.
 * A control inside that takes Tab for itself, by cancelling the key,
 * keeps it: the panel acts only on a Tab nothing inside it used. A
 * `TextArea` is not one of those; Tab leaves it here as it does
 * anywhere.
 *
 * **Focus leaving any other way closes it too**: moved by code, by a
 * shortcut that focuses another control, or by an assistive
 * technology. Focus on the anchor, or in an overlay opened from inside
 * the panel (a `Select`'s list, a nested popover), is still inside, by
 * the same rule a press outside is judged by.
 *
 * **Controlled by default.** With `open` the application owns the
 * state, and every way of closing it (Escape, a press outside, Tab
 * out, focus moved away, the anchor pressed again) is a request
 * through `onOpenChange` that it may refuse by not writing the value
 * back. With `defaultOpen` it owns its own.
 */
export interface PopoverProps {
  /** Whether it is open, for an application that owns the state. */
  open?: boolean;
  /** Whether it starts open, for a popover that owns its own state. Passing `open` as well throws. */
  defaultOpen?: boolean;
  /** Called with what the popover asks to become: `true` on an anchor press, `false` on every way it closes. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The node it opens beside, and the trigger whose presses toggle it.
   * Pass a cell the trigger's `ref` writes, as for `Menu`: a component
   * body runs before the ref fires, so a plain field would be `null`
   * here forever.
   */
  anchor?: UiNode | null;
  /** What it holds: text, fields, buttons. Read when it opens. */
  content?: UiChild;
  /** Its accessible name, announced as focus arrives. Not drawn. */
  label?: string;
  /** Read after the name, for a sentence about what the panel is for. Not drawn. */
  description?: string;
  /** The side of the anchor it prefers. Default `bottom`. Read when it opens. */
  side?: PopoverSide;
  /** Which edge of the anchor it lines up with. Default `start`. Read when it opens. */
  align?: PopoverAlign;
  /** The gap between the anchor and the panel, in pixels. Default 6. */
  offset?: number;
  /**
   * The node inside the content to focus when it opens, as a cell its
   * `ref` writes. Without one, or when it cannot take focus, the panel
   * itself is focused.
   */
  initialFocus?: UiNode | null;
  /** Its width. Without one it is as wide as its content, up to 360 pixels, then wraps. */
  width?: number;
  /**
   * Nothing opens it and it is not shown, whatever `open` says. For a
   * trigger that is unavailable for now; disable the trigger as well,
   * so it says so.
   */
  disabled?: boolean;
  /**
   * Receives the panel's node while it is open, and `null` when it
   * closes: the value for the trigger's `controls`.
   */
  panelRef?: UiNodeRef;
}

/** The widest a popover with no `width` draws, so a paragraph wraps at a readable measure. */
const MAX_WIDTH = 360;

export function Popover(inputs: Inputs<PopoverProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Popover');
  const description = input(inputs.description, '');
  const side = input(inputs.side, 'bottom');
  const align = input(inputs.align, 'start');
  const offset = input(inputs.offset, 6);
  const disabled = input(inputs.disabled, false);
  const focus = ctx.inject(FocusService);
  const overlay = useOverlay(ctx, 'popover');
  const tokens = themeTokenCell(controlTokens);
  const open = controlled<boolean>({
    component: 'Popover',
    name: 'open',
    source: inputs.open,
    initial: inputs.defaultOpen,
    fallback: false,
    onChange: inputs.onOpenChange
  });

  let placeholder: UiNode | null = null;
  /** The panel's node while it is mounted. */
  let panel: UiNode | null = null;
  /** The panel's node while focus is confined to it, inside a modal; see the panel's `ref`. */
  let trapped: UiNode | null = null;
  /** True while this component is the one taking the entry down, so the close is not reported back. */
  let hiding = false;
  /** Set by a press outside, which moves focus where it landed rather than back to the anchor. */
  let pressedAway = false;
  /**
   * What the last press outside landed on, until the focus it moves has
   * been heard: that press has asked to close already, and an owner who
   * refused should not be asked twice for one gesture.
   */
  let pressedOn: UiNode | null = null;
  /** True while this component is moving focus itself, out beside the anchor on Tab. */
  let moving = false;
  /**
   * Whether focus has been inside since the popover opened. Until it
   * has, focus elsewhere is where it was before the panel took it, not
   * focus that left.
   */
  let entered = false;

  const anchor = (): UiNode | null => inputs.anchor.value ?? null;

  /** Every way of closing asks; the open state, wherever it lives, decides. */
  const requestClose = (): void => {
    if (open.current()) {
      open.change(false);
    }
  };

  /**
   * Tab and Shift+Tab, done here rather than left to the focus manager.
   *
   * The manager walks the whole tree in order, and the panel is in the
   * overlay layer, after the application: Tab off its last control
   * would wrap to the top of the page, and Shift+Tab off its first
   * would land on whatever precedes it there, never on the anchor.
   * So inside the panel this walks the panel's own tab stops, and at
   * either end it steps out beside the anchor, as though the panel
   * were drawn right after it.
   */
  const tab = (event: UiKeyboardEvent): void => {
    const root = panel;
    // A control inside that wanted Tab for itself, to indent, say, has
    // cancelled it on the way here, and keeps it. Nothing in the
    // library does that, a `TextArea` included, but an application's
    // own field may.
    if (root === null || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const stops = tabStopsIn(root);
    const at = focus.focused.value;
    const index = at === null ? -1 : stops.indexOf(at);
    const back = event.modifiers.shift;
    const next = back ? (index === -1 ? -1 : index - 1) : index + 1;
    if (next >= 0 && next < stops.length) {
      focus.focus(stops[next]);
      return;
    }
    leave(back);
  };

  /** Focus out beside the anchor, then the close asked for. */
  const leave = (back: boolean): void => {
    const trigger = anchor();
    release();
    // Focus is about to leave on purpose, and the close is asked for
    // below; the watch on focus should not ask as well.
    moving = true;
    try {
      step(trigger, back);
    } finally {
      moving = false;
    }
    requestClose();
  };

  /** Focus to the anchor, and on Tab forward to what follows it. */
  const step = (trigger: UiNode | null, back: boolean): void => {
    if (trigger !== null) {
      focus.focus(trigger);
      if (!back) {
        focus.focusNext();
        // The anchor was the last stop in the application, so the next
        // one is the panel's first: there is nothing beyond to go to,
        // and the anchor is where the walk should rest.
        if (panel !== null && contains(panel, focus.focused.value)) {
          focus.focus(trigger);
        }
      }
    }
  };

  /** The anchor pressed, however it was pressed: open when shut, shut when open. */
  const toggle = (): void => {
    if (disabled.value) {
      return;
    }
    open.change(!open.current());
  };

  /**
   * A press outside the panel and its anchor. The anchor is excepted
   * because its press toggles, and a press that closed the popover on
   * the way down and reopened it on the click would never close it.
   *
   * So is any overlay opened after this one: a `Select`'s list, a
   * nested popover, a dialog the panel opened. Those are drawn in the
   * same layer as entries of their own, outside the panel's subtree,
   * and a press on an option in a select inside the popover is a press
   * inside it as far as the person is concerned.
   */
  const outside = (event: UiInputEvent): void => {
    pressedAway = true;
    pressedOn = event.target;
    requestClose();
    pressedAway = false;
  };
  const insideToo = (): readonly (UiNode | null)[] => [anchor(), ...laterEntries(panel)];

  /** Whether a node is inside as a press is judged: the panel, the anchor, or an overlay opened from the panel. */
  const inside = (node: UiNode): boolean =>
    (panel !== null && contains(panel, node)) || insideToo().some(root => root !== null && contains(root, node));

  /**
   * Focus that leaves by any route but Tab or a press, which have asked
   * already: moved by code, by a shortcut that focuses something else,
   * or by an assistive technology. A popover left open with the focus
   * outside it is the one Tab out closes to avoid. Focus going nowhere
   * (`null`, a window losing focus) is not focus somewhere else. Only a
   * move counts: a change of modality on the same node is reported as a
   * focus change too, and would use up the press it follows.
   */
  ctx.effect(focus.focused.pipe(distinctUntilChanged()), node => {
    const pressed = pressedOn;
    pressedOn = null;
    // A node not in the tree is not a place focus went: a `Select`
    // focuses its list as it opens it, a moment before the list's entry
    // is attached in the overlay layer, where it would be judged inside.
    if (node === null || panel === null || hiding || !overlay.isOpen() || rootOf(node) !== rootOf(panel)) {
      return;
    }
    if (inside(node)) {
      entered = true;
      return;
    }
    if (!entered || moving || (pressed !== null && contains(node, pressed))) {
      return;
    }
    // Focus is outside already, so `hide` leaves it where it went.
    requestClose();
  });

  /**
   * Focus goes in once the panel has been laid out, which is the first
   * moment its content is in the tree and focusable: the `ref` fires
   * before the children are built, so an `initialFocus` node is not
   * there yet when the panel's node is.
   */
  const settle = (): void => {
    const root = panel;
    if (root === null) {
      return;
    }
    const wanted = inputs.initialFocus.value ?? null;
    if (wanted !== null && contains(root, wanted)) {
      focus.focus(wanted);
      if (focus.focused.value === wanted) {
        return;
      }
    }
    focus.focus(root);
  };

  const release = (): void => {
    if (trapped !== null) {
      const scope = trapped;
      trapped = null;
      focus.releaseTrap(scope);
    }
  };
  ctx.onUnmount(release);

  const body = (nested: boolean): UiChild => {
    const width = inputs.width.value;
    return Column(
      {
        ref: (node: UiNode | null) => {
          panel = node;
          // Inside a modal dialog the focus manager confines focus to
          // the dialog, and the panel, drawn in the overlay layer, is
          // outside it: focus could not be given to the popover at all.
          // There, and only there, the panel takes a scope of its own,
          // as a menu opened in a dialog does. The page behind is inert
          // already, so it costs nothing a non-modal popover promises.
          if (node !== null && nested && trapped === null) {
            trapped = node;
            focus.trap(node);
          }
          inputs.panelRef.value?.(node);
        },
        modifiers: [
          tokens.modifier,
          clickOutside({ onOutside: outside, except: insideToo, wheel: false }),
          settleFocus({ settle })
        ],
        ...(width === undefined ? { maxWidth: MAX_WIDTH } : { width }),
        padding: 8,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: tokens.select(t => t.radius.sheet),
        role: 'dialog',
        label,
        description,
        // Focus's home when nothing inside asks for it, and where Escape
        // is heard from. Not a stop of its own in the Tab order.
        focusable: true,
        tabStop: false,
        // Escape asks to close; the keyboard goes back to the anchor
        // when it does, in `hide`.
        onKeyDown: (event: UiKeyboardEvent) => (event.key === 'Tab' ? tab(event) : escape(event))
      },
      // The content, scrolling where the window has less room than it
      // wants, as a dialog's body does. Four pixels of its own round
      // the content, so the focus ring outside a field at its edge is
      // not cut off where it clips.
      Column({ flexShrink: 1, minHeight: 0, overflow: 'auto', padding: 4 }, inputs.content.value ?? Row())
    );
  };

  const escape = keymap({ Escape: requestClose });

  const show = (): void => {
    const trigger = anchor();
    entered = false;
    overlay.show(body(focus.trapped.value), {
      anchor: trigger,
      // The anchor's tree, for the theme and for the reading direction
      // `start` and `end` are resolved in: the panel lines up with the
      // edge its anchor's text starts from. The placeholder only when
      // there is no anchor yet.
      environment: trigger ?? placeholder,
      placement: placementOf(side.value, align.value),
      offset: offset.value,
      // No backdrop: a press outside reaches the page, and
      // `clickOutside` on the panel hears it on the way and closes.
      dismissOnOutsidePress: false,
      onClose: () => {
        release();
        // Closed by something other than this component following
        // `open`, such as the overlay service closing everything: the
        // state hears about it, so it does not go on saying open.
        if (!hiding && open.current()) {
          open.change(false);
        }
      }
    });
  };

  /**
   * Focus inside the panel when it goes would go with it, so it goes
   * back to the anchor, unless a press elsewhere is moving it there
   * instead. Asked before the entry is closed, because closing takes
   * the panel's nodes out of the tree, and the focus with them.
   */
  const hide = (): void => {
    const trigger = anchor();
    const restore = !pressedAway && trigger !== null && panel !== null && contains(panel, focus.focused.value);
    hiding = true;
    overlay.hide();
    hiding = false;
    if (restore && focus.focused.value !== trigger) {
      focus.focus(trigger);
    }
  };

  // Shown while open and enabled, and only once the placeholder is in
  // the tree: before then there is no theme or direction to carry into
  // the layer, as `Dialog` found.
  let mounted = false;
  const sync = (): void => {
    const wanted = mounted && open.current() && !disabled.value;
    if (wanted && !overlay.isOpen()) {
      show();
    } else if (!wanted && overlay.isOpen()) {
      hide();
    }
  };
  ctx.onMount(() => {
    mounted = true;
    sync();
  });
  ctx.effect(open.value, sync);
  ctx.effect(disabled, sync);

  // The placeholder stays where the component was declared, for the
  // theme and direction the panel inherits, and hears the anchor's
  // presses for it.
  return Row({
    ref: (node: UiNode | null) => (placeholder = node),
    visible: false,
    width: 0,
    height: 0,
    modifiers: [anchorPresses({ anchor, toggle })]
  });
}

/**
 * The overlay placement for a side and an alignment.
 *
 * The overlay layer's placements name `start` and `end` as this does,
 * and resolves them in the anchor's reading direction, so the two only
 * have to be put together: the side, then the alignment unless it
 * centres.
 */
export function placementOf(side: PopoverSide, align: PopoverAlign): OverlayPlacement {
  return align === 'center' ? side : `${side}-${align}`;
}

/**
 * Hears a click on the anchor, wherever it came from.
 *
 * At the root, because the anchor is the caller's node and a component
 * cannot add a listener to a node it does not render. A click is what
 * the pointer, Enter and Space on a focused button, and an assistive
 * technology's press all send, so this one listener is all three.
 */
const anchorPresses = defineModifier<{ readonly anchor: () => UiNode | null; readonly toggle: () => void }>({
  name: 'popoverAnchor',
  attach(host, args) {
    host.onRoot(UiEventType.Click, (event: UiInputEvent) => {
      const anchor = args.anchor();
      if (anchor !== null && event.target !== null && contains(anchor, event.target)) {
        args.toggle();
      }
    });
  }
});

/** Calls `settle` once, the first time the panel is laid out. */
const settleFocus = defineModifier<{ readonly settle: () => void }>({
  name: 'popoverFocus',
  attach(host, args) {
    let done = false;
    host.onLayout(() => {
      if (!done) {
        done = true;
        args.settle();
      }
    });
  }
});

/**
 * The tab stops inside a node, in order, skipping what is hidden or
 * disabled with everything under it, as the focus manager's own walk
 * does.
 */
function tabStopsIn(root: UiNode): UiNode[] {
  const stops: UiNode[] = [];
  const visit = (node: UiNode): void => {
    if (node.properties.get('visible') === false || node.properties.get('disabled') === true) {
      return;
    }
    if (node !== root && isNodeTabStop(node)) {
      stops.push(node);
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(root);
  return stops;
}

/**
 * The overlay entries opened after this panel's, which are drawn
 * above it: the panel's node is the content of its entry's box, and
 * the entries are that box's siblings in the overlay layer, in the
 * order they were opened.
 */
function laterEntries(panel: UiNode | null): UiNode[] {
  const later: UiNode[] = [];
  for (let entry = panel?.parent?.nextSibling ?? null; entry !== null; entry = entry.nextSibling) {
    later.push(entry);
  }
  return later;
}

function rootOf(node: UiNode): UiNode {
  let at = node;
  while (at.parent !== null) {
    at = at.parent;
  }
  return at;
}

function contains(root: UiNode, node: UiNode | null): boolean {
  for (let at = node; at !== null; at = at.parent) {
    if (at === root) {
      return true;
    }
  }
  return false;
}
