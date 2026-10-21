import { BehaviorSubject, combineLatest, map, Subject, type Observable } from 'rxjs';

import { FocusService, input, ScrollService, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  Column,
  Row,
  Text,
  UiEventType,
  clickOutside,
  defineModifier,
  detectEditingPlatform,
  measureFlow,
  resolveString,
  type LayoutBox,
  type UiChild,
  type UiInputEvent,
  type UiKeyboardEvent,
  type UiNode
} from 'gesso-core';

import {
  MENU_BAR_CLOSED,
  MENU_SEPARATOR,
  menuBarStep,
  type MenuBarMenu,
  type MenuBarState,
  type MenuBarStep
} from './menuBarModel';
import { useOverlay } from './overlay';

export interface MenuBarProps<T> {
  /** The menus, left to right. */
  menus: readonly MenuBarMenu<T>[];
  /** Whether a command can be chosen at this moment. */
  enabled?: (item: T) => boolean;
  /** A command's label, which is what a row shows and type-ahead matches. */
  labelOf: (item: T) => string;
  /**
   * A command's keyboard shortcut, already written the way it should
   * be read.
   *
   * Formatted by the caller and not here, because what a shortcut is
   * called depends on the platform and on what the application has
   * decided to call its modifiers, and a component that guessed would
   * be wrong on somebody's machine in a way they cannot correct.
   */
  acceleratorOf?: (item: T) => string | undefined;
  /**
   * Whether a command is on, for one that is a setting rather than an
   * action: true draws a tick and false leaves its place empty. A
   * command it returns undefined for is a plain action and has no tick
   * at all.
   *
   * Read when its menu opens, like `labelOf`, so it answers from the
   * application's state rather than being kept in step with it.
   */
  checkedOf?: (item: T) => boolean | undefined;
  onChoose?: (item: T) => void;
  /** Called when the bar is done with the keyboard, so the page takes it back. */
  onDismiss?: () => void;
  /**
   * Whether F10 brings the keyboard to the bar from anywhere in the
   * application, and a second F10 hands it back to where it was.
   * Default true.
   *
   * Off for an application that has its own use for the key (a
   * debugger's Step over), and on all but one bar when a page has more
   * than one, since the first bar to hear the key takes it.
   */
  f10Key?: boolean;
  /**
   * Whether Alt does the same: pressed and released with no other key
   * between, it brings the keyboard to the bar and back, and held with
   * a menu's mnemonic it opens that menu from anywhere.
   *
   * Default true everywhere but macOS, which is the Windows and Linux
   * convention and not a Mac one: Option there types characters, and
   * Option and a letter is how somebody writes "ø". Off for an
   * application that gives Alt chords a meaning of its own.
   */
  altKey?: boolean;
  /** The bar itself, for an application that puts focus on it some other way than F10 or Alt. */
  barRef?: (node: UiNode | null) => void;
  /** What a screen reader calls the bar. */
  label?: string;
}

/**
 * A menu bar: titles along a strip, one panel open at a time.
 *
 * **One tab stop, not one per menu.** A bar is a single stop with a
 * roving highlight inside it, so Tab past it costs one press however
 * many menus it grows.
 *
 * **Focus stays on the bar while a menu is open.** The panel is an
 * overlay that draws and does not take the keyboard, which is the
 * opposite of what `Menu` does and the whole reason this is not
 * `Menu`: with focus trapped inside a popup, ArrowLeft has nowhere to
 * go, and walking to the menu next door with the arrows is most of
 * what makes a bar a bar.
 *
 * The keys are answered by `menuBarStep`, which is a table with its
 * own spec. This file draws what the table says and owns nothing but
 * the overlay.
 */
export function MenuBar<T>(inputs: Inputs<MenuBarProps<T>>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Main menu');
  const f10Key = input(inputs.f10Key, true);
  const altKey = input(inputs.altKey, detectEditingPlatform() !== 'mac');
  const overlay = useOverlay(ctx, 'menubar');
  const scroll = ctx.inject(ScrollService);
  const state = new BehaviorSubject<MenuBarState>(MENU_BAR_CLOSED);
  const menus = (): readonly MenuBarMenu<T>[] => inputs.menus.value;

  /** The node each title is drawn as, so a panel can sit under it. */
  const titles: (UiNode | null)[] = [];

  /**
   * The open panel's rows, by menu and index, so the row the keyboard
   * moves to can be scrolled to. Keyed by the menu as well because
   * walking along the bar unmounts one panel as the next mounts, and in
   * whichever order the two arrive, the rows going cannot take out the
   * rows coming that share their indices.
   */
  const rows = new Map<string, UiNode>();
  /** The open panel's scroller, whenever it is given a new box. */
  const scrollerBox = new Subject<LayoutBox>();

  /**
   * The row the keyboard last put the highlight on, as a menu and an
   * index, or null.
   *
   * Written by the keys and not derived from the state, because the
   * pointer moves the same highlight: a row half under the panel's
   * edge that the pointer brushed would otherwise jump the list under
   * it, which is the one thing a list being read with the pointer must
   * not do. A fresh object each time, so pressing a key always reveals
   * the row again, even after the wheel has scrolled it away.
   */
  const revealed = new BehaviorSubject<{ readonly menu: number; readonly at: number } | null>(null);

  /**
   * The title the pointer is over, or -1.
   *
   * Separate from the state because hovering a title while nothing is
   * open is not the same as opening it: the title lights up, and that
   * is all. Once a menu *is* open, hovering a different title switches
   * to it, which is what every menu bar does and what makes dragging
   * along the bar work.
   */
  const hoveredTitle = new BehaviorSubject(-1);

  /**
   * Whether the bar has focus the keyboard can see.
   *
   * The bar is one stop, and the arrows move a focus that lives in the
   * state rather than on a node, so nothing the runtime draws for focus
   * can say which title it is on. The title draws it instead, in the
   * focus ring's colour, and only for focus a key put there, as a ring
   * is: a click on a title is not a reason to mark it.
   */
  const focus = ctx.inject(FocusService);
  let barNode: UiNode | null = null;
  const barFocused: Observable<boolean> = combineLatest([focus.focused, focus.focusVisible]).pipe(
    map(([node, visible]) => visible && node !== null && node === barNode)
  );

  /**
   * True while `show` is taking a panel down in order to put another
   * one up.
   *
   * `overlay.hide()` reports itself through `onClose`, which is how a
   * press outside the menu gets back here — and walking from one menu
   * to the next hides one panel and shows another, so without this the
   * hide's own report arrives after the new state is written and
   * closes the menu that has just opened. ArrowRight would shut the
   * bar instead of moving along it.
   */
  let swapping = false;

  const context = {
    enabled: (item: T) => inputs.enabled.value?.(item) ?? true,
    labelOf: (item: T) => inputs.labelOf.value(item)
  };

  /**
   * The overlay follows the state rather than being opened beside it.
   *
   * Every path that opens or closes a menu — a key, a click, a choice,
   * a press outside — writes the state and nothing else, so there is
   * one place where "open" becomes a panel on screen and no way for
   * the two to disagree about which menu that is.
   */
  const show = (next: MenuBarState): void => {
    const was = state.value;
    state.next(next);
    if (!next.open) {
      revealed.next(null);
      if (overlay.isOpen()) {
        overlay.hide();
      }
      return;
    }
    if (overlay.isOpen() && was.focused === next.focused) {
      return;
    }
    // A different menu is a different panel in a different place, so it
    // is closed and reopened rather than moved.
    if (overlay.isOpen()) {
      swapping = true;
      overlay.hide();
      swapping = false;
    }
    const anchor = titles[next.focused] ?? null;
    overlay.show(panel(next.focused), {
      anchor,
      environment: anchor,
      placement: 'bottom-start',
      offset: 2,
      /**
       * No backdrop, and `clickOutside` instead.
       *
       * `dismissOnOutsidePress` inserts a full-screen box over
       * everything to catch the press, and a box over everything is a
       * box over the bar — so the titles stop receiving `pointerEnter`
       * and moving along the bar with the pointer does nothing.
       * `clickOutside` hears the press at the root and lets it
       * through, which is what its own documentation says a menu
       * wants. The titles are excepted, or pressing the open menu's
       * title would close it and reopen it in one press.
       */
      dismissOnOutsidePress: false,
      onClose: () => {
        if (!swapping && state.value.open) {
          state.next({ ...state.value, open: false, active: -1 });
        }
      }
    });
  };

  /**
   * Where focus was when F10 or Alt brought it to the bar, so leaving
   * can put it back; `entered` says the bar was reached that way at all.
   *
   * Two values and not one because "nothing had focus" is a place to go
   * back to as well: the bar lets go of the keyboard rather than keep
   * it. Both are forgotten the moment focus leaves the bar some other
   * way, by Tab or by a click, since where it went is then the user's
   * choice and putting it back later would undo it.
   */
  let entered = false;
  let returnTo: UiNode | null = null;
  ctx.effect(focus.focused, node => {
    if (node !== barNode) {
      entered = false;
      returnTo = null;
    }
  });

  /** Brings focus to the bar from wherever it is, or false when it could not go. */
  const enter = (): boolean => {
    if (barNode === null) {
      return false;
    }
    const before = focus.focused.value;
    focus.focus(barNode);
    // A modal dialog's trap keeps focus out of the bar behind it, and
    // then the key is not the bar's to spend.
    if (focus.focused.value !== barNode) {
      return false;
    }
    entered = true;
    returnTo = before;
    return true;
  };

  /**
   * Puts focus back where F10 or Alt found it, when that is how the bar
   * was reached. Run before `onDismiss`, so an application that moves
   * focus there has the last word.
   */
  const giveBack = (): void => {
    if (!entered) {
      return;
    }
    const to = returnTo;
    entered = false;
    returnTo = null;
    if (to !== null) {
      focus.focus(to);
    }
    // The node it came from is gone, or there was none: let go rather
    // than leave a bar that has said it is done holding the keyboard.
    if (focus.focused.value === barNode) {
      focus.blur();
    }
  };

  const choose = (item: T): void => {
    if (!context.enabled(item)) {
      return;
    }
    show({ ...state.value, open: false, active: -1 });
    giveBack();
    inputs.onChoose.value?.(item);
    // A choice closes the bar, whichever way it was made, and the docs
    // promise `onDismiss` after it: the keys' choice has always said so.
    inputs.onDismiss.value?.();
  };

  /** Draws what a key did, and reports what it chose and whether the bar is done. */
  const apply = (step: MenuBarStep<T>): void => {
    show(step.state);
    if (step.state.open && step.state.active !== -1) {
      revealed.next({ menu: step.state.focused, at: step.state.active });
    }
    if (step.dismiss === true) {
      giveBack();
    }
    if (step.choose !== undefined) {
      inputs.onChoose.value?.(step.choose);
    }
    if (step.dismiss === true) {
      inputs.onDismiss.value?.();
    }
  };

  /**
   * The key as the model reads it, which is in reading order: next is
   * Right. A bar reading right to left lays its titles out from the
   * right, so the next title is to the left, and Left and Right trade
   * places before the model sees them, as they do in `Menu`.
   */
  const readingKey = (key: string): string => {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return key;
    }
    const rtl = barNode !== null && resolveString(barNode, 'textDirection') === 'rtl';
    return rtl ? (key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft') : key;
  };

  const onKeyDown = (event: UiKeyboardEvent): void => {
    if (event.key === 'F10' && !f10Key.value) {
      return;
    }
    const step = menuBarStep(state.value, readingKey(event.key), menus(), context);
    if (step === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    apply(step);
  };

  /**
   * True from an Alt pressed alone until the next key or press.
   *
   * Alt on its own means the bar only when nothing came between its
   * press and its release: Alt and Left is the browser's Back, and Alt
   * held through a click is a modified click, and neither may end with
   * the menus taking the keyboard as the Alt comes up.
   */
  let altAlone = false;

  /** Every key and press, before anything below can stop it, to keep `altAlone` honest. */
  const watch = (event: UiInputEvent): void => {
    if (event.type !== UiEventType.KeyDown) {
      altAlone = false;
      return;
    }
    const { key, modifiers } = event as UiKeyboardEvent;
    altAlone = key === 'Alt' && !modifiers.ctrl && !modifiers.shift && !modifiers.meta;
  };

  /**
   * F10, and Alt with a mnemonic, wherever focus is.
   *
   * Heard at the root after the focused node and everything above it
   * have had the key, as an application's shortcuts are, so a control
   * that binds one of them itself keeps it. With the bar focused they
   * are left to its own `onKeyDown`, which reads the same keys through
   * the model.
   */
  const heard = (event: UiInputEvent): void => {
    const key = event as UiKeyboardEvent;
    if (key.defaultPrevented || focus.focused.value === barNode || menus().length === 0) {
      return;
    }
    const { ctrl, shift, alt, meta } = key.modifiers;
    // Shift+F10 is a context menu's key and not this one.
    if (key.key === 'F10' && !ctrl && !shift && !alt && !meta) {
      if (f10Key.value && enter()) {
        key.preventDefault();
        key.stopPropagation();
      }
      return;
    }
    if (!alt || ctrl || meta || !altKey.value) {
      return;
    }
    const letter = mnemonicOf(key);
    if (letter === null || !menus().some(menu => menu.mnemonic === letter)) {
      return;
    }
    const step = menuBarStep({ ...state.value, open: false, active: -1 }, letter, menus(), context);
    if (step !== null && enter()) {
      key.preventDefault();
      key.stopPropagation();
      apply(step);
    }
  };

  /** Alt coming up with nothing pressed since it went down: in to the bar, or back out of it. */
  const released = (event: UiInputEvent): void => {
    const key = event as UiKeyboardEvent;
    const alone = altAlone;
    altAlone = false;
    if (key.key !== 'Alt' || !alone || !altKey.value || key.defaultPrevented || menus().length === 0) {
      return;
    }
    if (focus.focused.value === barNode) {
      apply({ state: { ...state.value, open: false, active: -1 }, dismiss: true });
    } else if (!enter()) {
      return;
    }
    key.preventDefault();
    key.stopPropagation();
  };

  /**
   * Keeps the row the keyboard is on in view, when it still is.
   *
   * Run when a key moves the highlight, and again whenever the panel's
   * scroller is given a new box. The second is not a nicety: the key
   * that opens a menu also picks its row — ArrowUp on the bar opens it
   * on the last — and that row has not been laid out, so there is
   * nowhere to scroll it to, until the panel's first box arrives. A box
   * is reported from inside the frame's layout, where the runtime holds
   * a reveal until every box has settled. It is the scroller's box and
   * not its scroll position, so turning the wheel does not drag the
   * list back to the highlight; a window resized shorter does.
   */
  const reveal = (): void => {
    const target = revealed.value;
    const current = state.value;
    if (target === null || !current.open || current.focused !== target.menu || current.active !== target.at) {
      return;
    }
    const node = rows.get(`${target.menu}:${target.at}`);
    if (node !== undefined) {
      scroll.scrollIntoView(node, 4);
    }
  };
  ctx.effect(revealed, reveal);
  ctx.effect(scrollerBox, reveal);

  /**
   * The panel for one menu: its commands, their keys, and the rules
   * between.
   *
   * **A frame around a scroller, not one column.** A menu longer than
   * the window is given only the room under its title, and the rows
   * scroll inside that rather than running off the screen. The border,
   * the background, the radius and the padding stay on the frame, so
   * they hold still while the rows move, and so do the role and the
   * label: the frame is the menu, and the scroller is only how its rows
   * are laid out.
   *
   * The scroller is a column that scrolls, not a `ScrollView`, for the
   * reason the dialog's body is: a scroll view fills the width it is
   * offered, which in the overlay layer is the window's, and a panel is
   * as wide as its longest command. `minHeight: 0` lets it be shorter
   * than its rows, which is what scrolling is, and every row keeps its
   * own height rather than being shrunk to fit — a rule is a one-pixel
   * box with nothing in it, and would be the first to go.
   */
  const panel = (index: number): UiChild =>
    Column(
      {
        minWidth: 232,
        padding: 4,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8,
        role: 'menu',
        label: menus()[index]?.label ?? '',
        modifiers: [
          clickOutside({
            onOutside: () => show({ ...state.value, open: false, active: -1 }),
            except: () => titles.filter((node): node is UiNode => node !== null)
          })
        ]
      },
      Column(
        { overflow: 'auto', minHeight: 0, gap: 1, modifiers: [measureFlow(scrollerBox)] },
        ...(menus()[index]?.entries ?? []).map((entry, at) => item(entry, at, index, ticked(index)))
      )
    );

  /**
   * Keeps `rows` to the open panel's, so the highlight can be scrolled
   * to. A row leaving takes out only its own entry, so a panel reopened
   * before the last one's rows have gone keeps the rows it mounted.
   */
  const trackRow = (menu: number, at: number): ((node: UiNode | null) => void) => {
    const key = `${menu}:${at}`;
    let mounted: UiNode | null = null;
    return node => {
      if (node !== null) {
        mounted = node;
        rows.set(key, node);
      } else if (mounted !== null) {
        if (rows.get(key) === mounted) {
          rows.delete(key);
        }
        mounted = null;
      }
    };
  };

  /**
   * Whether a menu has a column for ticks: every row in it does when
   * any of its commands is a setting, so the labels stay in one line
   * whether or not each one is on.
   */
  const ticked = (menu: number): boolean => {
    const checkedOf = inputs.checkedOf.value;
    return (
      checkedOf !== undefined &&
      (menus()[menu]?.entries ?? []).some(entry => entry !== MENU_SEPARATOR && checkedOf(entry as T) !== undefined)
    );
  };

  const item = (entry: T | typeof MENU_SEPARATOR, at: number, menu: number, tickColumn: boolean): UiChild => {
    if (entry === MENU_SEPARATOR) {
      return Box({
        key: `rule-${at}`,
        height: 1,
        flexShrink: 0,
        marginTop: 3,
        marginBottom: 3,
        backgroundColor: 'border',
        role: 'separator'
      });
    }
    const command = entry as T;
    const text = context.labelOf(command);
    const on = context.enabled(command);
    const accelerator = inputs.acceleratorOf.value?.(command) ?? '';
    const checked = inputs.checkedOf.value?.(command);
    const highlighted: Observable<boolean> = state.pipe(
      map(current => current.open && current.focused === menu && current.active === at)
    );
    return Row(
      {
        key: text,
        ref: trackRow(menu, at),
        flexShrink: 0,
        gap: 24,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 5,
        paddingBottom: 5,
        borderRadius: 4,
        y: 'center',
        cursor: on ? 'pointer' : 'default',
        backgroundColor: highlighted.pipe(map(is => (is ? 'controlBackgroundHovered' : 'transparent'))),
        role: checked === undefined ? 'menuitem' : 'menuitemcheckbox',
        label: text,
        states: checked === true ? ['checked'] : undefined,
        disabled: !on,
        /**
         * Hovering moves the *same* highlight the arrows move.
         *
         * One highlight and not two: a menu with a keyboard highlight
         * on one row and a hover highlight on another is a menu that
         * cannot say what Enter will do. A disabled item is skipped,
         * on the rule `menuBarStep` already follows — the highlight
         * only ever rests where Enter would work.
         */
        onPointerEnter: () => {
          if (on && state.value.active !== at) {
            state.next({ ...state.value, active: at });
          }
        },
        onClick: () => choose(command)
      },
      Row(
        { flex: 1, gap: 6, y: 'center' },
        ...(tickColumn
          ? [
              Text({
                text: checked === true ? '✓' : '',
                width: 12,
                // The tick is the size of the command beside it, so it takes the same role.
                textStyle: 'bodySmall',
                color: on ? 'controlForeground' : 'controlForegroundDisabled',
                selectable: false
              })
            ]
          : []),
        Text({
          text,
          flex: 1,
          textStyle: 'bodySmall',
          color: on ? 'controlForeground' : 'controlForegroundDisabled',
          selectable: false
        })
      ),
      Text({
        text: accelerator,
        textStyle: 'bodySmall',
        color: 'textMuted',
        selectable: false
      })
    );
  };

  ctx.onUnmount(() => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  });

  return Row(
    {
      ref: (node: UiNode | null) => {
        barNode = node;
        inputs.barRef.value?.(node);
      },
      gap: 2,
      paddingLeft: 4,
      paddingRight: 4,
      y: 'center',
      focusable: true,
      role: 'menubar',
      label,
      onKeyDown,
      modifiers: [applicationKeys({ watch, heard, released })]
    },
    ...menus().map((menu, index) =>
      Row(
        {
          key: menu.label,
          ref: (node: UiNode | null) => {
            titles[index] = node;
          },
          paddingLeft: 9,
          paddingRight: 9,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 5,
          // Paint only, inside the box: marking the title moves nothing.
          borderWidth: 2,
          borderColor: combineLatest([state, barFocused]).pipe(
            map(([current, focused]) => (focused && current.focused === index ? 'focusRing' : 'transparent'))
          ),
          cursor: 'pointer',
          backgroundColor: combineLatest([state, hoveredTitle]).pipe(
            map(([current, hovered]) =>
              (current.open && current.focused === index) || hovered === index
                ? 'controlBackgroundHovered'
                : 'transparent'
            )
          ),
          onPointerEnter: () => {
            hoveredTitle.next(index);
            // With a menu already open, moving along the bar opens the
            // one under the pointer. Without that, a bar is something
            // you have to click four times to read.
            if (state.value.open && state.value.focused !== index) {
              show({ focused: index, open: true, active: -1 });
            }
          },
          onPointerLeave: () => {
            if (hoveredTitle.value === index) {
              hoveredTitle.next(-1);
            }
          },
          onClick: () => {
            const current = state.value;
            // Clicking the menu that is already open closes it, which is
            // what a title bar does everywhere.
            show(
              current.open && current.focused === index
                ? { focused: index, open: false, active: -1 }
                : { focused: index, open: true, active: -1 }
            );
          }
        },
        Text({
          text: menu.label,
          textStyle: 'bodySmall',
          color: 'text',
          selectable: false
        })
      )
    )
  );
}

/**
 * The keys that reach a menu bar from anywhere in the application.
 *
 * At the root, as Tooltip's Escape is, because the point of them is
 * that the bar does not have focus yet and a key goes to whatever does.
 * `watch` listens in the capture phase so a control that spends a key
 * cannot hide from it that Alt is no longer alone; `heard` and
 * `released` listen in the bubble phase, after that control, and spend
 * a key only when they acted on it, so with the bar not interested the
 * key goes on to the page as before.
 */
const applicationKeys = defineModifier<{
  readonly watch: (event: UiInputEvent) => void;
  readonly heard: (event: UiInputEvent) => void;
  readonly released: (event: UiInputEvent) => void;
}>({
  name: 'menuBarKeys',
  attach(host, args) {
    host.onRoot(UiEventType.KeyDown, args.watch);
    host.onRoot(UiEventType.PointerDown, args.watch);
    host.onRoot(UiEventType.KeyDown, args.heard, { capture: false });
    host.onRoot(UiEventType.KeyUp, args.released, { capture: false });
  }
});

/**
 * The letter an Alt chord names, lower case.
 *
 * From the physical key where the event says which it was, because Alt
 * changes the character on some layouts and the mnemonic is the letter
 * printed on the key, not whatever the layout made of it.
 */
function mnemonicOf(event: UiKeyboardEvent): string | null {
  const physical = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code);
  if (physical !== null) {
    return (physical[1] ?? physical[2]!).toLowerCase();
  }
  return [...event.key].length === 1 ? event.key.toLowerCase() : null;
}
