import { combineLatest, map, type Observable } from 'rxjs';
import {
  Button as ButtonElement,
  Text,
  interactive,
  type UiChild,
  type UiModifier,
  type UiNodeRef,
  type UiSemanticState
} from '@gesso/core';

import { input, themeTokenCell, type ComponentContext, type Inputs, type ThemeTokenCell } from '@gesso/framework';
import { trackFocus } from './focus';
import { CONTROL_FOCUS_RING, layoutOf, type ControlLayoutProps, modifiersOf } from './internals';
import {
  controlTokens,
  type ButtonPaint,
  type ButtonSize,
  type ButtonSizeTokens,
  type ButtonTone,
  type ButtonVariant,
  type ControlTokens
} from './tokens';

/**
 * A button, themed.
 *
 * The element stays a
 * `UiNodeType`, because moving it would touch the hit tester, the
 * focus manager and both renderers to gain nothing, and the library
 * exports a wrapper over it. What the wrapper adds is everything an
 * application wrote by hand thirty-nine times: padding, a radius, a
 * pair of theme tokens, a hover, a press, a focus ring, a pointer
 * cursor, and a label that is the visible text and the accessible name
 * at once.
 *
 * The three axes are the ones a design system has:
 *
 *   - `variant` is how much of the surface the button claims: `filled`
 *     for the one action a screen is about, `tonal` for a secondary
 *     one, `outlined` where a filled button would be too loud, `plain`
 *     for something that is really a link.
 *   - `tone` is what the action means: `neutral`, `accent`, `danger`.
 *   - `size` is how big it is: `small`, `medium`, `large`.
 *
 * Nothing about its colours is a prop. Every one of them is a palette
 * name resolved at paint against the theme the button inherits, so a
 * button restyles with the appearance toggle and a button inside a
 * nested theme provider follows that theme instead. Restyling one is
 * a theme provider around it, as it is for every other component
 *.
 */
export type { ButtonSize, ButtonTone, ButtonVariant } from './tokens';

export interface ButtonProps extends ControlLayoutProps {
  /** Receives the node that *is* the button, for focus and anchoring. */
  ref?: UiNodeRef;
  /**
   * The words on it, and the name an assistive technology reads.
   *
   * One prop for both because they are the same thing in every button
   * that has words on it, and two props are two things to keep in
   * step. A button whose content is a glyph passes `children` and
   * keeps `label` as the name, which is the only case where they
   * differ and is exactly the case that needs saying.
   */
  label?: string;
  /** Longer help, for a button whose label cannot say everything. */
  description?: string;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  disabled?: boolean;
  /**
   * Marks the action as the one in progress, so it reads as busy and
   * refuses presses without looking disabled.
   */
  busy?: boolean;
  onClick?: () => void;
  /** Content instead of the label's text; `label` stays the name. */
  children?: UiChild;
}

export function Button(inputs: Inputs<ButtonProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const description = input(inputs.description, '');
  const disabled = input(inputs.disabled, false);
  const busy = input(inputs.busy, false);
  const focus = trackFocus(ctx, inputs.ref);

  // Read once, as `Divider` reads its direction and `Card` its
  // padding. A variant chooses the interaction modifier, and a
  // modifier list is fixed for the life of an element (see
  // `rootModifiers` in `internals.ts`), so a button that has to change
  // variant changes `key` and is built again.
  const variant = input(inputs.variant, 'filled').value ?? 'filled';
  const tone = input(inputs.tone, 'neutral').value ?? 'neutral';
  const size = input(inputs.size, 'medium').value ?? 'medium';

  // Every metric, every palette name and the dim a filled button
  // answers the pointer with come from here, resolved against the
  // theme this button turns out to be under rather than at the moment
  // this function runs. See `tokens.ts`.
  const tokens = themeTokenCell(controlTokens);
  const metrics = (read: (size: ButtonSizeTokens) => number): Observable<number> =>
    tokens.select(t => read(t.button.sizes[size]));
  const paint = <R>(read: (paint: ButtonPaint) => R): Observable<R> =>
    tokens.select(t => read(t.button.paint[variant][tone]));

  const press = (): void => {
    if (disabled.value || busy.value) {
      return;
    }
    inputs.onClick.emit();
  };

  return ButtonElement(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      modifiers: modifiersOf(inputs, tokens.modifier, ...buttonModifiers(variant, tokens)),
      paddingX: metrics(size => size.paddingX),
      paddingY: metrics(size => size.paddingY),
      x: 'center',
      y: 'center',
      borderRadius: metrics(size => size.radius),
      borderWidth: paint(p => (p.border === undefined ? 0 : 1)),
      borderColor: paint(p => p.border),
      backgroundColor: paint(p => p.background),
      // The standing rule, and the reason a wrapper exists at all: a
      // clickable thing says so under the pointer.
      cursor: 'pointer',
      disabled,
      label,
      description,
      role: 'button',
      states: states(busy),
      onClick: press
    },
    inputs.children.value ??
      Text({
        text: label,
        // A role rather than a size and a weight, so the words on a
        // button are the same type as the words beside it and both
        // follow the theme, which is why this is the idiom.
        textStyle: tokens.select(t => t.button.sizes[size].textStyle),
        fontWeight: 600,
        // Bound on the label, not provided from the root: `color` does
        // not cascade from a parent node the way it does in CSS, so a
        // token that reached only the root would leave the words at
        // the theme's default ink.
        color: foreground(
          paint(p => p.foreground),
          disabled
        ),
        selectable: false
      })
  );
}

/**
 * What an assistive technology is told, as it changes.
 *
 * Only `busy`: `disabled` is a property of its own on the element and
 * the mirror reads it there, so saying it twice would be the empty
 * `states` array the Inputs tier already had to fix once.
 */
function states(busy: Observable<boolean>): Observable<UiSemanticState[]> {
  return busy.pipe(map(working => (working ? ['busy' as UiSemanticState] : [])));
}

/** The label's colour: the variant's, or the disabled token. */
function foreground(resting: Observable<string>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([resting, disabled]).pipe(map(([token, off]) => (off ? 'controlForegroundDisabled' : token)));
}

/**
 * How each variant answers the pointer.
 *
 * A filled button has no token to move to: its ground is already the
 * accent or the ink, and there is no `controlAccentHovered`. So it
 * dims instead, by an amount the theme now names, and which the eye
 * reads as a press for the same reason a physical key darkens under a
 * finger. The three variants with no ground of their own gain one,
 * from the control tokens that every other component in the library
 * hovers with; those are palette names and were already themed.
 *
 * Built per button rather than shared at module level, which is a
 * distinction worth reading carefully. What the modifier contract
 * forbids is a modifier list built **per render**, whose
 * arguments compare unequal each time and so detach and re-attach the
 * ring, losing the hover state with it. A component body runs once per
 * instance, so these are built once per button and are stable for its
 * life — the same reason `tokens.modifier` itself is safe here. The
 * surface variants could still share one value; they do not, so that
 * all four read the same way and none of them is a special case.
 */
function buttonModifiers(variant: ButtonVariant, tokens: ThemeTokenCell<ControlTokens>): readonly UiModifier[] {
  const interaction =
    variant === 'filled'
      ? interactive({
          hover: true,
          press: true,
          hovered: { opacity: tokens.select(t => t.button.hoveredOpacity) },
          pressed: { opacity: tokens.select(t => t.button.pressedOpacity) }
        })
      : interactive({
          hover: true,
          press: true,
          hovered: { backgroundColor: 'controlBackgroundHovered' },
          pressed: { backgroundColor: 'controlBackgroundPressed' }
        });
  return [interaction, CONTROL_FOCUS_RING];
}
