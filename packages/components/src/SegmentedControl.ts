import { combineLatest, map, type Observable } from 'rxjs';
import {
  Row,
  Text,
  defaultSpacing,
  interactive,
  type UiChild,
  type UiElement,
  type UiModifier,
  type UiSemanticState
} from 'gesso-core';

import { input, themeTokenCell, type ComponentContext, type Inputs, type ThemeTokenCell } from 'gesso-framework';

import { controlled, type ControlledValue } from './controlled';
import { trackFocus } from './focus';
import { CONTROL_FOCUS_RING, keymap, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { controlTokens, type ButtonSize, type ButtonSizeTokens, type ControlTokens } from './tokens';

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * One choice from a few, drawn as one track cut into segments.
 *
 * The control at the top of a pane that says which of three views is
 * below it, or which of two units a figure is in: Day / Week / Month,
 * Grid / List, Celsius / Fahrenheit. Few options, all of them short,
 * all of them worth seeing at once, and the whole thing costing one
 * line of a toolbar.
 *
 * ## Why `radiogroup` and not `tablist`
 *
 * This is the first question the file has to answer, because the paint
 * is the paint a browser's tab strip has and the instinct is to call
 * it one.
 *
 * A `tablist` is a promise about the page: these controls each reveal
 * a panel, the panels are siblings, and the one you pick is the one
 * that is showing. An assistive technology acts on that promise — it
 * offers to move to the panel the tab controls, and it expects a
 * `tabpanel` to be there when it arrives. A segmented control that
 * picks Celsius has no panel to move to, and declaring one would send
 * a reader somewhere that does not exist.
 *
 * What this control actually does is pick a *value*, exclusively, from
 * a handful of choices. That is a radio group, and a radio group is
 * what it declares. It is `RadioGroup`'s semantics and `RadioGroup`'s
 * keyboard in a different paint.
 *
 * If the thing being switched *is* which panel is shown, the library
 * already has `Tabs` in `Structure.ts`, and `Tabs` draws the tab strip,
 * declares the `tablist`, and puts a `tabpanel` under it with the
 * selected tab's name on it. Reach for that one instead. The rule is
 * about what changes, not about how wide the control is: a value is
 * this component, a panel is `Tabs`.
 *
 * ## Why it is not a `variant` on `RadioGroup`
 *
 * Honestly: because the two halves that are shared are the two halves
 * that are cheap to share, and the two that are not shared are all of
 * the component.
 *
 * The semantics are identical (`radiogroup` over `radio`s, `checked`
 * on the chosen one) and the keyboard is identical, and both of those
 * are about fifteen lines. Everything else differs. A radio group
 * stacks down by default, puts a dot beside each label, carries an
 * error message under itself, and has `invalid`, `required` and
 * `direction` props that mean something for a form field. A segmented
 * control is a single horizontal track with no dots, no message, no
 * validation, and a `size` that resolves through the button tokens so
 * it can sit in a toolbar beside a `Button` and match its height.
 *
 * A `variant: 'segmented'` on `RadioGroup` would therefore be a prop
 * that turns four other props off, changes the default of a fifth, and
 * switches out the entire body — which is a second component hiding
 * inside the first, with a type that lies about which combinations are
 * meaningful. Two components that agree on a keyboard cost less than
 * one component with a mode. What is genuinely shared is shared: both
 * read `keymap`, `CONTROL_FOCUS_RING`, `layoutOf` and `controlled`
 * from the same places.
 *
 * ## Keyboard, which is `RadioGroup`'s
 *
 * The track is the single tab stop and the segments are not tab stops,
 * so Tab moves past the whole control rather than through it. Inside,
 * the arrows move the choice and **walking selects**: this is the
 * "selection follows focus" pattern ARIA allows for a radio group, it
 * is what `RadioGroup` does, and it needs no roving focus and no
 * separate highlight that a reader would then have to commit with
 * Space. Home and End go to the ends. Every one of them steps over a
 * segment marked `disabled` rather than landing on it, and Home and
 * End reach the first and last segment that can actually be chosen
 * rather than the first and last drawn.
 *
 * Both axes are bound, as they are on `RadioGroup`. The track is only
 * ever a row, so Up and Down match no layout here; they are bound
 * anyway because a reader who has learned one arrow pair on the radio
 * groups in the same form should not discover that this control
 * answers only the other.
 *
 * ## The paint
 *
 * One track, and no slots. The track is a `controlBackground` trough
 * with a `controlBorder` ring — the ring for the reason `Badge`'s
 * neutral tone has one, that `controlBackground` is the colour of a
 * surface and an unringed trough on a card has no shape at all. The
 * segments sit flush inside it with no gap, because a gap between
 * segments lets the trough show between them and the eye reads five
 * slots with one thing in them rather than one thing with five parts.
 *
 * The chosen segment is a raised sheet in the selection pair, which is
 * the pair the library already uses for *chosen rather than operated*
 * — a picked row of a list, a tree or a table — and which is exactly
 * what a chosen segment is. It is the same call `Chip`'s outlined
 * variant makes when it is on. Under it the unchosen segments are
 * transparent and their words are `textMuted`, so the contrast between
 * quiet and loud is what says which is which, as it does across a row
 * of chips.
 *
 * **Without colour.** The sheet also carries a one-pixel ring the
 * unchosen segments do not have, and that ring is the cue that
 * survives greyscale, a colour-vision difference and a bad projector.
 * `borderWidth` is paint-only and takes no space, so the ring
 * appearing and disappearing never moves a segment. A weight change on
 * the chosen segment's words would have been the other obvious cue and
 * is deliberately not used: text at 600 is wider than the same text at
 * 400, so the track would have resized every time the choice moved.
 * While the track has keyboard focus the ring turns `controlAccent`,
 * which is `RadioGroup`'s trick for saying where the arrows will land.
 *
 * Every metric — both paddings, the radius and the type role — comes
 * from `controlTokens.button.sizes[size]`, so a segmented control and
 * a `Button` of the same `size` are the same height, are cut to the
 * same radius and set their words in the same role, and a theme that
 * squares off or re-scales its buttons moves this with them. The
 * track's own radius is the segment's plus the two-pixel inset, so the
 * two curves stay concentric. No number in this file is a literal
 * except that inset, and no colour in it is anything but a palette
 * name.
 *
 * ## Options that change, and values that are not in them
 *
 * `options` is required and is a cell, and the segments are built from
 * `inputs.options.pipe(map(...))`, so a control whose choices arrive
 * from a request, or grow when a feature is switched on, rebuilds its
 * segments when the cell emits. Reading `inputs.options.value` once in
 * the body would have frozen the track at whatever the first array
 * held, which is the defect this follows `RadioGroup` to avoid. The
 * keyboard reads the cell's current value at the moment a key arrives,
 * so the arrows walk the segments that are actually drawn.
 *
 * An **empty** `options` draws an empty track: a trough with its ring,
 * its role and its name, and nothing in it. It answers no key, because
 * there is nothing to move to. It is not nothing, on purpose — an
 * empty array is usually "not loaded yet", and a control that vanished
 * and came back would move everything beside it twice.
 *
 * A `value` that **matches no option** — a preference saved before the
 * options changed is the usual way to get one — draws no chosen
 * segment: the whole track is quiet. The control does not silently
 * correct it to the first segment, because that would show the
 * application a choice it did not make and does not hold, and the
 * disagreement would surface later as a save that writes back
 * something nobody picked. An arrow recovers: from no match, a forward
 * step lands on the first selectable segment and a backward step on
 * the last, which is `RadioGroup`'s rule too. The same reasoning is
 * why supplying neither `value` nor `defaultValue` leaves the control
 * with nothing chosen rather than with its first segment lit.
 */
export interface SegmentedControlProps extends ControlLayoutProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly SegmentedOption[];
  /** The group's accessible name. */
  label?: string;
  disabled?: boolean;
  /** Default `medium`; the same three sizes a `Button` has. */
  size?: ButtonSize;
}

export function SegmentedControl(inputs: Inputs<SegmentedControlProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const disabled = input(inputs.disabled, false);
  const focus = trackFocus(ctx);

  // Read once, as `Button` reads its size and `Chip` its variant: a
  // size picks one row of the token table, every metric on the track
  // and on each segment is derived from that row, and a component body
  // runs once. A control that has to change size changes its `key`.
  const size = input(inputs.size, 'medium').value ?? 'medium';
  const tokens = themeTokenCell(controlTokens);

  // '' rather than the first option's value: see the note on the props
  // above. A control that lit its first segment when nobody had chosen
  // anything would be showing the application a value it does not
  // hold.
  const value = controlled<string>({
    component: 'SegmentedControl',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  /**
   * The segments a key may land on, read at the moment the key
   * arrives so that a control whose options changed walks the ones it
   * is drawing. A disabled control offers none.
   */
  const selectable = (): readonly SegmentedOption[] =>
    disabled.value ? [] : inputs.options.value.filter(option => option.disabled !== true);

  /** Moves the choice by `delta`, stepping over disabled segments. */
  const step = (delta: number): void => {
    const options = selectable();
    if (options.length === 0) {
      return;
    }
    const at = options.findIndex(option => option.value === value.current());
    // No match is a value from outside the options. A forward step
    // lands on the first segment and a backward one on the last, so an
    // arrow is the recovery from a stale saved preference.
    const next = at === -1 ? (delta > 0 ? 0 : options.length - 1) : (at + delta + options.length) % options.length;
    value.change(options[next].value);
  };

  const edge = (which: 'first' | 'last'): void => {
    const options = selectable();
    if (options.length > 0) {
      value.change(which === 'first' ? options[0].value : options[options.length - 1].value);
    }
  };

  const select = (option: SegmentedOption): void => {
    if (!disabled.value && option.disabled !== true) {
      value.change(option.value);
    }
  };

  const segments = inputs.options.pipe(
    map(options => options.map(option => segment(option, value, disabled, focus.focused, tokens, size, select)))
  );

  return Row(
    {
      ...layoutOf(inputs),
      ref: focus.ref,
      // `tokens.modifier` fills the cell from whatever theme this track
      // turns out to be under; every `select` below, including the ones
      // inside the segments, reads that one cell.
      modifiers: modifiersOf(inputs, tokens.modifier, CONTROL_FOCUS_RING),
      focusable: true,
      disabled,
      padding: INSET,
      // Concentric with the segments: the same radius plus the inset
      // the segments are held in by.
      borderRadius: tokens.select(t => t.button.sizes[size].radius + INSET),
      borderWidth: 1,
      borderColor: 'controlBorder',
      backgroundColor: 'controlBackground',
      // No gap: a gap would let the trough show between the segments,
      // and a track with slots in it is not one control any more.
      y: 'stretch',
      role: 'radiogroup',
      label,
      onKeyDown: keymap({
        ArrowRight: () => step(1),
        ArrowDown: () => step(1),
        ArrowLeft: () => step(-1),
        ArrowUp: () => step(-1),
        Home: () => edge('first'),
        End: () => edge('last')
      })
    },
    segments
  );
}

/**
 * One segment: a `radio` in the semantics tree, and not a tab stop.
 * The track is (see the keyboard note above).
 */
function segment(
  option: SegmentedOption,
  value: ControlledValue<string>,
  groupDisabled: Observable<boolean>,
  groupFocused: Observable<boolean>,
  tokens: ThemeTokenCell<ControlTokens>,
  size: ButtonSize,
  select: (option: SegmentedOption) => void
): UiElement {
  const chosen = value.value.pipe(map(current => current === option.value));
  const off = groupDisabled.pipe(map(all => all || option.disabled === true));
  const active = combineLatest([chosen, groupFocused]).pipe(map(([on, focused]) => on && focused));
  const metric = <R>(read: (tokens: ButtonSizeTokens) => R): Observable<R> =>
    tokens.select(t => read(t.button.sizes[size]));

  return Row(
    {
      key: option.value,
      modifiers: [segmentInteraction(chosen, off)],
      paddingX: metric(size => size.paddingX),
      paddingY: metric(size => size.paddingY),
      x: 'center',
      y: 'center',
      // A track given a width hands the extra to its segments evenly,
      // and a track left to itself is as wide as its labels. Shrinking
      // is refused because half a word is not a choice anyone can read.
      flexGrow: 1,
      flexShrink: 0,
      borderRadius: metric(size => size.radius),
      backgroundColor: chosen.pipe(map(on => (on ? 'selectionBackground' : 'transparent'))),
      // The greyscale-safe half of "this one is chosen". Paint-only, so
      // it costs no space and the track does not move when it appears.
      borderWidth: chosen.pipe(map(on => (on ? 1 : 0))),
      borderColor: active.pipe(map(on => (on ? 'controlAccent' : 'controlBorder'))),
      cursor: 'pointer',
      role: 'radio',
      label: option.label,
      states: chosen.pipe(map(on => (on ? (['checked'] as UiSemanticState[]) : []))),
      onClick: () => select(option)
    },
    Text({
      text: option.label,
      // A role rather than a size, so the words on a segment are the
      // same type as the words on a `Button` beside it and both follow
      // the theme. One weight for every segment, chosen or not: see the
      // paint note on why the weight is not the selection cue.
      textStyle: metric(size => size.textStyle),
      fontWeight: 600,
      color: words(chosen, off),
      textWrap: 'none',
      selectable: false
    })
  );
}

/** The inset the segments are held in by, and the trough that shows. */
const INSET = defaultSpacing.hairline;

/**
 * A segment's words: the selection's ink when it is chosen, muted when
 * it is not, and the disabled token when it cannot be picked at all.
 *
 * Disabled wins over chosen, because a disabled segment that is also
 * the current value is still a segment nobody can act on, and saying
 * so is more useful than saying it is the one.
 */
function words(chosen: Observable<boolean>, disabled: Observable<boolean>): Observable<string> {
  return combineLatest([chosen, disabled]).pipe(
    map(([on, off]) => (off ? 'controlForegroundDisabled' : on ? 'selectionForeground' : 'textMuted'))
  );
}

/**
 * How a segment answers the pointer.
 *
 * Built per segment with cells rather than tokens, for the defect
 * `Chip` records: `interactive`'s hovered colour *replaces* the bound
 * one, so a shared modifier with a static `controlBackgroundHovered`
 * would wash the chosen segment's sheet away under the pointer and
 * leave its selection-coloured words on the trough — the one segment
 * being pointed at becoming the one that cannot be read. The chosen
 * segment therefore holds its ground, and so does a segment that
 * cannot be picked: a hover that promises a click that will not happen
 * is worse than no hover.
 *
 * A segment's modifiers are built once per element, and an element
 * here is built once per entry in `options`, so these keep their
 * identity for the segment's life the way a module-level bundle would.
 */
function segmentInteraction(chosen: Observable<boolean>, disabled: Observable<boolean>): UiModifier {
  const ground = (hovered: string) =>
    combineLatest([chosen, disabled]).pipe(
      map(([on, off]) => (on ? 'selectionBackground' : off ? 'transparent' : hovered))
    );
  return interactive({
    hover: true,
    press: true,
    hovered: { backgroundColor: ground('controlBackgroundHovered') },
    pressed: { backgroundColor: ground('controlBackgroundPressed') }
  });
}
