import { map, type Observable } from 'rxjs';
import {
  Button as ButtonElement,
  Text,
  bundle,
  defaultSpacing,
  interactive,
  type UiChild,
  type UiModifier,
  type UiModifierBundle,
  type UiNodeRef,
  type UiSemanticState,
  type UiTypographyRole
} from '@gesso/core';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { trackFocus } from './focus';
import { CONTROL_FOCUS_RING, layoutOf, type ControlLayoutProps, modifiersOf } from './internals';

/**
 * A button, themed.
 *
 * `COMPONENTS_ROADMAP.md` promised this: the element stays a
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
 * (`COMPONENTS_ROADMAP.md` §2.3).
 */
export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'plain';
export type ButtonTone = 'neutral' | 'accent' | 'danger';
export type ButtonSize = 'small' | 'medium' | 'large';

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
  const metrics = SIZES[size];
  const paint = PAINT[variant][tone];

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
      modifiers: modifiersOf(inputs, ...BUTTON_MODIFIERS[variant]),
      paddingX: metrics.paddingX,
      paddingY: metrics.paddingY,
      x: 'center',
      y: 'center',
      borderRadius: metrics.radius,
      borderWidth: paint.border === undefined ? 0 : 1,
      borderColor: paint.border,
      backgroundColor: paint.background,
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
        // follow the theme. `decisions/0079` is why this is the idiom.
        textStyle: metrics.textStyle,
        fontWeight: 600,
        color: foreground(paint.foreground, disabled),
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
function foreground(resting: string, disabled: Observable<boolean>): Observable<string> {
  return disabled.pipe(map(off => (off ? 'controlForegroundDisabled' : resting)));
}

interface ButtonMetrics {
  readonly paddingX: number;
  readonly paddingY: number;
  readonly radius: number;
  readonly textStyle: UiTypographyRole;
}

/**
 * The three sizes, from the spacing scale rather than from numbers
 * chosen here.
 *
 * They are the *default* scale's values and not the inherited theme's,
 * because a component has no way to read the environment while its
 * body runs; `Card`'s padding and `Toolbar`'s gap have the same
 * limitation. A theme that changes its spacing changes what an
 * application's own boxes measure, not what a library control does.
 */
const SIZES: Readonly<Record<ButtonSize, ButtonMetrics>> = {
  small: {
    paddingX: defaultSpacing.small,
    paddingY: defaultSpacing.extraSmall,
    radius: 6,
    textStyle: 'bodySmall'
  },
  medium: {
    paddingX: defaultSpacing.medium,
    paddingY: defaultSpacing.small,
    radius: 8,
    textStyle: 'body'
  },
  large: {
    paddingX: defaultSpacing.large,
    paddingY: defaultSpacing.medium,
    radius: 10,
    textStyle: 'bodyLarge'
  }
} as const;

interface ButtonPaint {
  readonly background: string;
  readonly foreground: string;
  readonly border?: string;
}

/**
 * Twelve combinations, written out.
 *
 * Every value is a palette name, so the table says nothing about
 * light and dark: `controlForeground` on `controlBackground` is ink on
 * chalk in one appearance and chalk on ink in the other, and a filled
 * neutral button inverts with the toggle without a branch anywhere.
 * A generated table would be shorter and would hide exactly the two
 * places the pattern breaks: `tonal` uses the selection pair for an
 * accent, and `plain` has no ground at all.
 */
const PAINT: Readonly<Record<ButtonVariant, Readonly<Record<ButtonTone, ButtonPaint>>>> = {
  filled: {
    neutral: { background: 'controlForeground', foreground: 'controlBackground' },
    accent: { background: 'controlAccent', foreground: 'controlBackground' },
    danger: { background: 'danger', foreground: 'controlBackground' }
  },
  tonal: {
    neutral: { background: 'controlBackground', foreground: 'controlForeground' },
    accent: { background: 'selectionBackground', foreground: 'selectionForeground' },
    danger: { background: 'controlBackground', foreground: 'danger' }
  },
  outlined: {
    neutral: { background: 'transparent', foreground: 'controlForeground', border: 'controlBorder' },
    accent: { background: 'transparent', foreground: 'controlAccent', border: 'controlAccent' },
    danger: { background: 'transparent', foreground: 'danger', border: 'danger' }
  },
  plain: {
    neutral: { background: 'transparent', foreground: 'controlForeground' },
    accent: { background: 'transparent', foreground: 'controlAccent' },
    danger: { background: 'transparent', foreground: 'danger' }
  }
} as const;

/**
 * How each variant answers the pointer.
 *
 * A filled button has no token to move to: its ground is already the
 * accent or the ink, and there is no `controlAccentHovered`. So it
 * dims instead, which is one value that works on every tone and in
 * both appearances, and which the eye reads as a press for the same
 * reason a physical key darkens under a finger. The three variants
 * with no ground of their own gain one, from the control tokens that
 * every other component in the library hovers with.
 *
 * One shared bundle per variant, built at module level: a modifier's
 * arguments are compared by identity, so a list built per render would
 * detach and re-attach the ring and lose the hover state with it
 * (`decisions/0022-modifiers.md`).
 */
const FILLED_INTERACTION: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { opacity: 0.88 },
  pressed: { opacity: 0.76 }
});

const SURFACE_INTERACTION: UiModifier = interactive({
  hover: true,
  press: true,
  hovered: { backgroundColor: 'controlBackgroundHovered' },
  pressed: { backgroundColor: 'controlBackgroundPressed' }
});

const BUTTON_MODIFIERS: Readonly<Record<ButtonVariant, UiModifierBundle>> = {
  filled: bundle(FILLED_INTERACTION, CONTROL_FOCUS_RING),
  tonal: bundle(SURFACE_INTERACTION, CONTROL_FOCUS_RING),
  outlined: bundle(SURFACE_INTERACTION, CONTROL_FOCUS_RING),
  plain: bundle(SURFACE_INTERACTION, CONTROL_FOCUS_RING)
} as const;
