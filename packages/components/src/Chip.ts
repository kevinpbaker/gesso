import {
  Button as ButtonElement,
  Row,
  Text,
  defaultSpacing,
  interactive,
  type UiChild,
  type UiModifier,
  type UiNodeRef,
  type UiSemanticState,
  type UiTypographyRole
} from '@gesso/core';

import { of } from 'rxjs';

import {
  computed,
  controlled,
  createComponent,
  input,
  type ComponentContext,
  type ControlledValue,
  type Inputs
} from '@gesso/framework';
import { trackFocus } from './focus';
import { CONTROL_FOCUS_RING, layoutOf, type ControlLayoutProps, modifiersOf } from './internals';
import { Icon } from './Media';

/**
 * A chip: a pill that is on or off.
 *
 * The control a row of filters is made of. Each one names a genre, a
 * mood, a language or a switch, and a press turns it on or off; the
 * chips that are on say what the list below them is showing. Segue and
 * Sluice had written three of their own before this one existed, and
 * `EXCELLENCE_ROADMAP.md` X14 made their removal the interim gate for
 * the component library.
 *
 * It is a toggle, and it says so the way a toggle should: the role is
 * `button` and the `pressed` state follows `selected`, which is what
 * `aria-pressed` is for. A chip that is never on (a "Back" chip, a
 * "Clear filters" chip) is the same component with `selected` left
 * off; it reads as a plain button.
 *
 * Two axes, because the two applications needed both and no more:
 *
 *   - `variant` is what the chip is made of. `filled` is a sheet that
 *     inverts when it is on, ink on chalk becoming chalk on ink, which
 *     is the loud choice for a row that filters a whole page. `outlined`
 *     is a ring that fills with the selection wash when it is on, for a
 *     toolbar where a dozen chips sit beside the words they filter.
 *   - `size` is how big it is: `small` for a dense toolbar, `medium`
 *     for a row of its own.
 *
 * Nothing about its colours is a prop. Every one is a palette name
 * resolved at paint against the theme the chip inherits, so it follows
 * the appearance toggle and a nested theme provider alike, as every
 * other control in the library does (`COMPONENTS_ROADMAP.md` §2.3).
 *
 * Controlled by default: `selected` is the application's and the chip
 * draws it, reporting a press through `onPress` with the value it would
 * take. `defaultSelected` makes it self-managing, as `defaultChecked`
 * does for a checkbox (§2.2).
 */
export type ChipVariant = 'filled' | 'outlined';
export type ChipSize = 'small' | 'medium';

export interface ChipProps extends ControlLayoutProps {
  /** Receives the node that *is* the chip, for focus and anchoring. */
  ref?: UiNodeRef;
  /**
   * The word on it, and the name an assistive technology reads unless
   * `name` says more.
   */
  label?: string;
  /**
   * The accessible name, when it should say more than the word.
   *
   * A chip in a row that filters a page reads "Metal"; what pressing it
   * does is "Show Metal, 119,205 tracks", and that is what a screen
   * reader should say. Defaults to the label, with the count after it
   * when there is one.
   */
  name?: string;
  /** Longer help, for a chip whose word cannot say everything. */
  description?: string;
  /**
   * Whether it is on. The application owns it and the chip draws it;
   * supplying this makes the chip controlled.
   */
  selected?: boolean;
  /**
   * The starting value, when the chip owns it. Supplying this makes the
   * chip self-managing; supplying both throws. Supplying neither makes
   * a plain button that is never on.
   */
  defaultSelected?: boolean;
  /**
   * A figure after the word, in the same colour at the normal weight
   * so it reads as a count beside a word rather than a second word. It
   * joins the accessible name unless `name` replaces it.
   */
  count?: number | string;
  /** SVG path data for a glyph before the word, on the usual 24 grid. */
  icon?: string;
  variant?: ChipVariant;
  size?: ChipSize;
  /**
   * The role the words are set in, when the size's own is wrong: a chip
   * carrying a code or a figure wants the theme's monospace role.
   */
  textStyle?: UiTypographyRole;
  disabled?: boolean;
  /**
   * Fired on a click and on Enter or Space, with the value the chip
   * would take. A controlled chip moves only when the application
   * writes it back.
   */
  onPress?: (selected: boolean) => void;
}

export function Chip(inputs: Inputs<ChipProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const description = input(inputs.description, '');
  const disabled = input(inputs.disabled, false);
  const count = input(inputs.count, undefined);
  const given = input(inputs.name, undefined);
  const focus = trackFocus(ctx, inputs.ref);
  const value = selection(inputs);

  // Read once, as `Button` reads its axes: a variant chooses a paint
  // table and a modifier, and a modifier list is fixed for the life of
  // an element, so a chip that has to change variant changes `key`.
  const variant = input(inputs.variant, 'filled').value ?? 'filled';
  const size = input(inputs.size, 'medium').value ?? 'medium';
  const metrics = SIZES[size];
  const paint = PAINT[variant];
  const textStyle = input(inputs.textStyle, metrics.textStyle);

  const on = computed(read => read(value.value));
  const ground = computed(() => (on.value ? paint.on : paint.off));

  /**
   * The name: what was given, else the word and its count.
   *
   * Derived here rather than left to the caller, so the count a chip
   * shows is the count a screen reader hears without a second prop to
   * keep in step.
   */
  const name = computed(() => {
    const explicit = given.value;
    if (explicit !== undefined) {
      return explicit;
    }
    const figure = count.value;
    return figure === undefined ? label.value : `${label.value}, ${figure}`;
  });

  const foreground = computed(() => (disabled.value ? 'controlForegroundDisabled' : ground.value.foreground));

  const press = (): void => {
    if (disabled.value) {
      return;
    }
    value.change(!value.current());
  };

  const children: UiChild[] = [];
  if (inputs.icon.value !== undefined) {
    children.push(
      createComponent(Icon, {
        path: input(inputs.icon, ''),
        size: metrics.icon,
        color: foreground
      })
    );
  }
  children.push(
    Text({
      text: label,
      // A role rather than a size and a weight, so the word on a chip is
      // the same type as the words beside it and follows the theme.
      textStyle,
      fontWeight: 600,
      color: foreground,
      textWrap: 'none',
      selectable: false
    })
  );
  if (count.value !== undefined) {
    children.push(
      Text({
        text: computed(() => String(count.value ?? '')),
        textStyle,
        color: foreground,
        textWrap: 'none',
        selectable: false
      })
    );
  }

  return ButtonElement(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      modifiers: modifiersOf(inputs, interactionFor(paint, on), CONTROL_FOCUS_RING),
      paddingX: metrics.paddingX,
      paddingY: metrics.paddingY,
      x: 'center',
      y: 'center',
      // Larger than any height a chip can have, so every size is a pill.
      borderRadius: PILL,
      borderWidth: paint.bordered ? 1 : 0,
      borderColor: paint.bordered ? computed(() => ground.value.border) : undefined,
      backgroundColor: computed(() => ground.value.background),
      // The standing rule: a clickable thing says so under the pointer.
      cursor: 'pointer',
      flexShrink: 0,
      disabled,
      label: name,
      description,
      role: 'button',
      states: computed(() => (on.value ? (['pressed'] as UiSemanticState[]) : [])),
      onClick: press
    },
    Row({ gap: metrics.gap, y: 'center' }, ...children)
  );
}

/** Larger than any height a chip can have. */
const PILL = 999;

/**
 * Whether the chip is on, in whichever of the three forms it was given.
 *
 * `selected` is the controlled form and `defaultSelected` the
 * self-managing one, as `controlled` has them for every other control.
 * Given neither, a checkbox is self-managing and starts unticked; a
 * chip is not, because a chip that is never on is a thing a row of
 * chips actually has ("Clear filters", "Back", "Replay"), and a plain
 * button that quietly turned itself on when pressed would be a bug in
 * every one of them. So the third form is a plain button: never on, and
 * `onPress` fires with `true`, the value a chip that could be on would
 * take.
 */
function selection(inputs: Inputs<ChipProps>): ControlledValue<boolean> {
  if (inputs.selected.value === undefined && inputs.defaultSelected.value === undefined) {
    return {
      value: of(false),
      current: () => false,
      change: next => inputs.onPress.emit(next)
    };
  }
  return controlled<boolean>({
    component: 'Chip',
    name: 'selected',
    source: inputs.selected,
    initial: inputs.defaultSelected,
    fallback: false,
    onChange: inputs.onPress
  });
}

interface ChipMetrics {
  readonly paddingX: number;
  readonly paddingY: number;
  readonly gap: number;
  readonly icon: number;
  readonly textStyle: UiTypographyRole;
}

/**
 * The two sizes, from the spacing scale rather than from numbers chosen
 * here, and matched to `Button`'s vertical metrics so a chip and a
 * button on one row are the same height. A pill wants more room at its
 * round ends than a rectangle does, so the horizontal padding is one
 * step wider than the button's.
 *
 * The default scale's values and not the inherited theme's, for the
 * reason `Button` gives: a component cannot read the environment while
 * its body runs.
 */
const SIZES: Readonly<Record<ChipSize, ChipMetrics>> = {
  small: {
    paddingX: defaultSpacing.medium,
    paddingY: defaultSpacing.extraSmall,
    gap: defaultSpacing.extraSmall,
    icon: 14,
    textStyle: 'bodySmall'
  },
  medium: {
    paddingX: defaultSpacing.large,
    paddingY: defaultSpacing.small,
    gap: defaultSpacing.extraSmall,
    icon: 16,
    textStyle: 'body'
  }
} as const;

/** What one state of one variant is painted with. */
interface ChipGround {
  readonly background: string;
  readonly foreground: string;
  readonly border?: string;
  /** The ground under the pointer, and while held down. */
  readonly hovered: string;
  readonly pressed: string;
}

interface ChipPaint {
  readonly off: ChipGround;
  readonly on: ChipGround;
  readonly bordered: boolean;
  /**
   * Whether the chip dims under the pointer when it is on, rather than
   * moving to another token. A filled chip that is on is painted in the
   * foreground itself, and there is nothing beyond the foreground to
   * move to, so it dims as the filled `Button` does.
   */
  readonly dims: boolean;
}

/**
 * Four grounds, written out.
 *
 * Every value is a palette name, so the table says nothing about light
 * and dark. A filled chip that is off is a control-coloured sheet with
 * muted words; on, it is the foreground with the sheet's colour for
 * words, which inverts with the appearance by itself. An outlined chip
 * is a ring of `controlBorder` around muted words, and on it fills with
 * the selection pair and takes the accent for its ring.
 *
 * The words of a chip that is off are `textMuted` rather than
 * `controlForeground`, on purpose: a row of filters is a row of quiet
 * things with one or two loud ones, and that contrast is what tells a
 * reader which is which.
 */
const PAINT: Readonly<Record<ChipVariant, ChipPaint>> = {
  filled: {
    off: {
      background: 'controlBackground',
      foreground: 'textMuted',
      hovered: 'controlBackgroundHovered',
      pressed: 'controlBackgroundPressed'
    },
    on: {
      background: 'controlForeground',
      foreground: 'controlBackground',
      hovered: 'controlForeground',
      pressed: 'controlForeground'
    },
    bordered: false,
    dims: true
  },
  outlined: {
    off: {
      background: 'transparent',
      foreground: 'textMuted',
      border: 'controlBorder',
      hovered: 'controlBackgroundHovered',
      pressed: 'controlBackgroundPressed'
    },
    on: {
      background: 'selectionBackground',
      foreground: 'selectionForeground',
      border: 'controlAccent',
      hovered: 'controlBackgroundHovered',
      pressed: 'controlBackgroundPressed'
    },
    bordered: true,
    dims: false
  }
} as const;

/** How far a filled chip that is on dims under the pointer, and when held. */
const DIM_HOVERED = 0.88;
const DIM_PRESSED = 0.76;

/**
 * How the chip answers the pointer: the library's `interactive`, with
 * overrides that follow `selected`.
 *
 * The hovered ground of a chip depends on whether it is on. A static
 * override cannot say that, and the first private chips found out what
 * happens when it tries: `interactive`'s hovered colour *replaces* the
 * bound one, so a chosen chip under the pointer went light while its
 * words stayed white, and the one chip the person was pointing at was
 * the one they could not read. They fell back to tracking the pointer
 * by hand, which is the pattern `decisions/0022` made the modifier to
 * remove.
 *
 * The modifier host subscribes an Observable written as an override
 * for as long as the modifier is attached, so the answer is to hand it
 * cells rather than tokens. The chip's own `interactive` is built once
 * per instance, in the body, so its arguments keep their identity for
 * the life of the element exactly as a module-level bundle's would.
 */
function interactionFor(paint: ChipPaint, on: { readonly value: boolean }): UiModifier {
  const hovered: Record<string, unknown> = {
    backgroundColor: computed(() => (on.value ? paint.on.hovered : paint.off.hovered))
  };
  const pressed: Record<string, unknown> = {
    backgroundColor: computed(() => (on.value ? paint.on.pressed : paint.off.pressed))
  };
  if (paint.dims) {
    hovered.opacity = computed(() => (on.value ? DIM_HOVERED : 1));
    pressed.opacity = computed(() => (on.value ? DIM_PRESSED : 1));
  }
  return interactive({ hover: true, press: true, hovered, pressed });
}
