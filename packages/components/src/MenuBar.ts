import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { Box, Column, Row, Text, clickOutside, type UiChild, type UiKeyboardEvent, type UiNode } from 'gesso-core';

import { MENU_BAR_CLOSED, MENU_SEPARATOR, menuBarStep, type MenuBarMenu, type MenuBarState } from './menuBarModel';
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
  onChoose?: (item: T) => void;
  /** Called when the bar is done with the keyboard, so the page takes it back. */
  onDismiss?: () => void;
  /** The bar itself, for an application that puts focus on it from a shortcut. */
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
  const overlay = useOverlay(ctx, 'menubar');
  const state = new BehaviorSubject<MenuBarState>(MENU_BAR_CLOSED);
  const menus = (): readonly MenuBarMenu<T>[] => inputs.menus.value;

  /** The node each title is drawn as, so a panel can sit under it. */
  const titles: (UiNode | null)[] = [];

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

  const choose = (item: T): void => {
    if (!context.enabled(item)) {
      return;
    }
    show({ ...state.value, open: false, active: -1 });
    inputs.onChoose.value?.(item);
  };

  const onKeyDown = (event: UiKeyboardEvent): void => {
    const step = menuBarStep(state.value, event.key, menus(), context);
    if (step === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    show(step.state);
    if (step.choose !== undefined) {
      inputs.onChoose.value?.(step.choose);
    }
    if (step.dismiss === true) {
      inputs.onDismiss.value?.();
    }
  };

  /** The panel for one menu: its commands, their keys, and the rules between. */
  const panel = (index: number): UiChild =>
    Column(
      {
        minWidth: 232,
        padding: 4,
        gap: 1,
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
      ...(menus()[index]?.entries ?? []).map((entry, at) => item(entry, at, index))
    );

  const item = (entry: T | typeof MENU_SEPARATOR, at: number, menu: number): UiChild => {
    if (entry === MENU_SEPARATOR) {
      return Box({
        key: `rule-${at}`,
        height: 1,
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
    const highlighted: Observable<boolean> = state.pipe(
      map(current => current.open && current.focused === menu && current.active === at)
    );
    return Row(
      {
        key: text,
        gap: 24,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 5,
        paddingBottom: 5,
        borderRadius: 4,
        y: 'center',
        cursor: on ? 'pointer' : 'default',
        backgroundColor: highlighted.pipe(map(is => (is ? 'controlBackgroundHovered' : 'transparent'))),
        role: 'menuitem',
        label: text,
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
      Text({
        text,
        flex: 1,
        fontSize: 12,
        color: on ? 'controlForeground' : 'controlForegroundDisabled',
        selectable: false
      }),
      Text({ text: accelerator, fontSize: 11, color: 'textMuted', selectable: false })
    );
  };

  ctx.onUnmount(() => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  });

  return Row(
    {
      ref: inputs.barRef.value ?? undefined,
      gap: 2,
      paddingLeft: 4,
      paddingRight: 4,
      y: 'center',
      focusable: true,
      role: 'menubar',
      label,
      onKeyDown
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
        Text({ text: menu.label, fontSize: 12, color: 'text', selectable: false })
      )
    )
  );
}
