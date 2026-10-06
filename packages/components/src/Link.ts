import { Row, Text, type UiChild, type UiNodeRef, type UiTextDecoration } from 'gesso-core';

import {
  computed,
  input,
  internalState,
  RouterService,
  ShellService,
  type ComponentContext,
  type Inputs,
  type RouteTarget
} from 'gesso-framework';

import { CONTROL_FOCUS_RING, keymap, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { trackFocus } from './focus';
import { followRoute, middlePress, opensElsewhere } from './follow';

/**
 * A link: a control whose press takes you somewhere else.
 *
 * The role is the whole of it. `role: 'link'` tells an assistive
 * technology that activating this goes somewhere; `role: 'button'`
 * tells it that something happens here. A reader who cannot see the
 * blue words navigates a page by that distinction — links are listed
 * together, announced as links, and followed with the expectation of
 * arriving somewhere — so getting it wrong is not a cosmetic mistake.
 * **A link navigates; a button acts.** "Read the docs" and "Open in a
 * new tab" are links. "Save", "Delete", "Show more" and "Sign in" are
 * [Button](./Button.ts), even when the design paints them as words in
 * the accent colour, and `Button` has a `plain` variant for exactly
 * that painting.
 *
 * ## There is no anchor here, which is why this is a control
 *
 * Everything below follows from one fact about the runtime: the tree is
 * painted onto a canvas, in a worker, and there is no `<a>` in it. No
 * element the browser will navigate for us, no default action to
 * prevent, no status bar showing the target, and no href the platform
 * has already decided is safe. A link here is an
 * ordinary focusable control whose activation asks the shell to open a
 * URL: `ctx.inject(ShellService)`, then `shell.openUrl(href)`, which
 * the runtime forwards to whichever host it has. The host opens the tab
 * (`GessoApp` directly, `WorkerApp` by posting to the main thread), so
 * the gesture crosses a thread boundary and the component never touches
 * `window`.
 *
 * Where it goes is one of two props, and `onPress` may sit beside
 * either:
 *
 *   - **`href`** is the outbound link: somewhere the shell owns, off
 *     this application.
 *   - **`to`** is the in-app link: a url of this application's own,
 *     `/epic/BUD-12?story=BUD-13`, or a `RouteTarget` built with
 *     `to(route, params)`. Activating it navigates through
 *     `RouterService`, in place, as `router.navigate(to)` would. It is
 *     still a link, and still says so, because what the reader does
 *     with it is go somewhere.
 *   - **`onPress`** runs first, before either, so a handler that
 *     records the click has recorded it before anything moves. Alone,
 *     it is the in-app link the older way, with the routing inside the
 *     handler, and it still works; what it cannot do is be opened
 *     somewhere new, because the destination is inside a function the
 *     link cannot see into. That is the reason `to` exists.
 *   - **`to` and `href` together** is a mistake with an answer rather
 *     than an error: `to` wins. A link goes to one place, and the one
 *     the application can route to is the one it most likely meant.
 *
 * ## Somewhere new: Cmd-click, Ctrl-click and the middle button
 *
 * A browser opens an anchor in a new tab when it is clicked with
 * Command (macOS) or Control (elsewhere) held, or with the middle
 * button, and people expect the same of anything that announces itself
 * as a link. This one does it for `to`:
 *
 *   - A click with **Command or Control** held, either one on any
 *     platform (see `opensElsewhere` for why the worker does not guess
 *     which machine it is on), or a press of the **middle button**,
 *     runs `onPress` and then asks the shell to open the app at `to`
 *     somewhere new: `ShellService.openRoute`. The current screen does
 *     not navigate. What "somewhere new" is belongs to the shell: a
 *     browser tab at the app's own address, a tab in the product an
 *     embedded app lives in, or a new desktop window.
 *   - **Command-Enter or Control-Enter** on a focused link does the
 *     same from the keyboard. Enter is the key the component binds, so
 *     reading its modifiers costs nothing.
 *   - An **`href`** link behaves exactly as it does on a plain click,
 *     with a modifier or without: `openUrl` already opens outside the
 *     application, so there is nowhere newer to send it.
 *   - An **`onPress`-only** link runs `onPress` and nothing else.
 *
 * The middle button is recognised by the press, not the click: a Click
 * is dispatched on release and carries the buttons held then, which is
 * none, so the link notes the PointerDown's buttons and the click that
 * follows reads them. Space, and an assistive technology's activation,
 * arrive as a click with no modifiers, and follow the link in place.
 *
 * ## Enter is the component's key. Space is the runtime's
 *
 * The keymap is one binding, `{ Enter: activate }`, because Enter is
 * what activates a native anchor and Space is not: on a web page Space
 * is the reader's page-down, and a link that swallowed it would turn
 * "keep reading" into a navigation away from the thing being read.
 * That is the argument, and it is the reason the table has one row.
 *
 * It is not, however, the whole of what happens, and the page says so
 * rather than pretending otherwise. `UiKeyboardController` presses any
 * focused node whose role is `button` or `link` on Enter **or** Space,
 * by synthesising a click; it is a default, cancellable by
 * `preventDefault` on the key. So Enter runs through this keymap, which
 * consumes the event and stops the default from firing a second time,
 * and Space falls through to the default and activates the link.
 *
 * This component deliberately does not bind Space to a no-op to
 * suppress that, for two reasons. The reason to withhold Space from a
 * link is the page scroll it would steal, and there is no page scroll
 * here: this is a canvas runtime, nothing in it listens for Space, and
 * a scroller is scrolled by the wheel and by its own keys. And an
 * assistive technology that maps its activation gesture onto Space
 * would find a link that answered nothing, which is a worse defect than
 * a link that answers one key more than an anchor does.
 *
 * `Checkbox` binds both keys itself and says why on its own page; the
 * difference is that a checkbox is a row standing in for a native
 * input, where a link is standing in for an anchor.
 *
 * ## The rule under it
 *
 * `underline` is `always`, `hover` or `none`, and it is drawn with the
 * real `textDecoration` property rather than with a hairline box, so it
 * sits where the font says a rule should sit and is one thing for the
 * text renderer to draw rather than a second node to lay out.
 *
 * The default is `hover`. A body of prose with permanently underlined
 * links is hard to read and a link with no rule at all is hard to find,
 * so the resting state leans on colour and the rule appears when the
 * pointer confirms what the reader is pointing at. `always` is for a
 * link inside running text, where colour alone is not enough to tell a
 * word apart from the sentence around it; `none` is for a link that is
 * already obviously one, a navigation item or a breadcrumb.
 *
 * **Why the decoration is a bound cell and not an `interactive`
 * modifier.** `Button` answers the pointer with
 * `interactive({ hovered: { ... } })`, and that was tried here first.
 * It does not work, for a reason worth recording so nobody tries it
 * again: a modifier writes properties on the node it is attached to,
 * and the node that is the link is the row, while the thing that needs
 * the rule is the text inside it. `textDecoration` is declared
 * `inherited`, but inheritance in this engine resolves from the
 * *environment*, not from a parent node's property (`resolveProperty`
 * in `UiPropertyResolver.ts`) — which is the same trap the comment on
 * `Button`'s label colour records. Measured: with
 * `interactive({ hovered: { textDecoration: 'underline' } })` on the
 * row, the row's own property reads `underline` and the text under it
 * still resolves `none`. Providing a `textStyle` environment instead
 * would work and would cost more than it is worth, because a provided
 * `textStyle` replaces the inherited role's style outright rather than
 * merging with it, so a link would silently lose the size and the
 * weight of the prose it sits in.
 *
 * What is here instead: the row keeps `onPointerEnter` and
 * `onPointerLeave`, the component holds one boolean of its own, and the
 * decoration is a `computed` bound on the words. The rule follows the
 * pointer with no modifier re-attached and no environment disturbed.
 * The cost is honest and worth naming: the decoration is bound to the
 * text *this component draws*, so a caller who supplies `children`
 * decorates their own content, exactly as a caller who supplies
 * `children` to `Button` colours their own content.
 *
 * ## Colour, and disabled
 *
 * The resting ink is `controlAccent`, so a link reads as a link in
 * whatever theme it lands under, and a disabled one is
 * `controlForegroundDisabled`. Both are palette names resolved at paint
 * against the inherited theme, not colours and not props. There is no
 * colour prop on this component and there will not be one; restyling a
 * link is a theme provider around it.
 *
 * `disabled` refuses everything: no `onPress`, no navigation, no rule on
 * hover, and the disabled ink. It stays focusable, as every disabled
 * control in this library does, because a control the keyboard cannot
 * reach is a control whose disabled state nobody is told about. It is
 * the element's own `disabled` property rather than a semantic state,
 * which is where the accessibility mirror reads it from.
 *
 * ## Nothing here is read once
 *
 * `Button` reads its variant once because a variant picks a modifier
 * and a modifier list is fixed for the life of an element. Nothing on a
 * link does that: the modifier list is the focus ring and whatever the
 * caller attached, and `underline` only decides what a bound cell
 * computes. So every prop, `underline` included, follows a cell as it
 * changes, and no caller of this component ever needs to change its
 * `key` to change how it looks.
 */
export type LinkUnderline = 'always' | 'hover' | 'none';

export interface LinkProps extends ControlLayoutProps {
  /** Receives the node that *is* the link, for focus and anchoring. */
  ref?: UiNodeRef;
  /** The words on it, and its accessible name. */
  label?: string;
  /**
   * Opened through `ShellService` when the link is activated.
   *
   * There is no anchor and no browser-managed navigation here, so this
   * is a request the render thread hands to the shell rather than a
   * target the platform already knows about. Leave it off for an in-app
   * link and give `to` instead. A modified click opens it the same way
   * a plain one does.
   */
  href?: string;
  /**
   * Where in this application it goes: a url of the router's,
   * `/epic/BUD-12?story=BUD-13`, or a `RouteTarget` from `to(route,
   * params)`.
   *
   * Activated plainly, the router navigates there in place. With
   * Command or Control held, with the middle button, or with
   * Command-Enter or Control-Enter, the shell is asked to open the app
   * there somewhere new (`ShellService.openRoute`), and the current
   * screen stays. Wins over `href` when both are given.
   */
  to?: string | RouteTarget;
  /**
   * Called on activation, before `to` is followed or `href` opened,
   * whichever way the link was activated.
   *
   * Beside `to` or `href`, it is the hook that runs before anything
   * moves. Alone, it is an in-app link that routes inside the handler,
   * which cannot be opened somewhere new; prefer `to`.
   */
  onPress?: () => void;
  /** Refuses activation, and paints the words in the disabled ink. */
  disabled?: boolean;
  /** Default `hover`. */
  underline?: LinkUnderline;
  /** Content instead of the label's text; `label` stays the name. */
  children?: UiChild;
}

export function Link(inputs: Inputs<LinkProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const underline = input(inputs.underline, 'hover');
  const shell = ctx.inject(ShellService);
  const router = ctx.inject(RouterService);
  const focus = trackFocus(ctx, inputs.ref);
  const middle = middlePress();

  // The pointer, held here rather than read back from `interactive`'s
  // `visualState`. See the note in the header: a modifier can only
  // write properties on the node it is attached to, and the rule has to
  // land on the text inside this one.
  const hovered = internalState(false);

  /** `elsewhere`: the press asked for the destination somewhere new. */
  const activate = (elsewhere: boolean): void => {
    if (disabled.value) {
      return;
    }
    // Before anything moves, so a handler that records the click has
    // recorded it by the time the router or the shell is asked.
    inputs.onPress.emit();
    const to = inputs.to.value;
    if (to !== undefined) {
      followRoute(to, elsewhere, router, shell);
      return;
    }
    // Outbound: already outside the application, however it was asked.
    const url = inputs.href.value;
    if (url !== undefined) {
      shell.openUrl(url);
    }
  };

  return Row(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      modifiers: modifiersOf(inputs, CONTROL_FOCUS_RING),
      x: 'center',
      y: 'center',
      focusable: true,
      // The standing rule: a thing that can be pressed says so under
      // the pointer.
      cursor: 'pointer',
      disabled,
      role: 'link',
      label,
      onPointerDown: middle.onPointerDown,
      onClick: event => activate(middle.take() || opensElsewhere(event.modifiers)),
      // One key: Enter, which is what activates an anchor, and with
      // Command or Control held it opens the destination somewhere new.
      // Space is deliberately unbound, so it falls through to the
      // runtime's own default for a focused `link`, which presses it.
      // See the header.
      onKeyDown: keymap({ Enter: event => activate(opensElsewhere(event.modifiers)) }),
      onPointerEnter: () => {
        hovered.value = true;
      },
      onPointerLeave: () => {
        hovered.value = false;
      }
    },
    inputs.children.value ??
      Text({
        text: label,
        // Bound on the words rather than provided from the root, so
        // the link keeps its accent under an ancestor that sets a
        // `color` of its own, which would otherwise cascade into it.
        color: computed(() => (disabled.value ? 'controlForegroundDisabled' : 'controlAccent')),
        textDecoration: computed(() => decorationOf(underline.value, hovered.value, disabled.value)),
        selectable: false
      })
  );
}

/**
 * The rule, from the mode and the pointer.
 *
 * A disabled link never draws one, whatever the mode says: the rule is
 * the promise that pressing this goes somewhere, and a disabled link is
 * the one that does not.
 */
function decorationOf(mode: LinkUnderline, hovered: boolean, disabled: boolean): UiTextDecoration {
  if (disabled || mode === 'none') {
    return 'none';
  }
  return mode === 'always' || hovered ? 'underline' : 'none';
}
