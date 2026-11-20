import { BehaviorSubject, combineLatest, map } from 'rxjs';

import { input, themeTokenCell, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Column,
  EditableText,
  Row,
  Text,
  type UiChild,
  type UiKeyboardEvent,
  type UiKeyModifiers,
  type UiNodeRef,
  type UiPointerEvent,
  type UiSemanticState,
  type UiTextChangeEvent
} from 'gesso-core';
import { chevron, CHEVRON_DOWN, CHEVRON_RIGHT } from './chevron';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { controlTokens } from './tokens';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  foregroundToken,
  keymap,
  layoutOf,
  modifiersOf,
  followedChildren,
  type ControlLayoutProps
} from './internals';

/**
 * The pieces of a property inspector: the panel beside a canvas that
 * shows what is chosen and lets it be changed. Sections that fold,
 * label and value rows, and a number field with a unit that can be
 * typed, stepped with the arrows or scrubbed by dragging its label,
 * with a "mixed" state for a selection whose values differ.
 *
 * They compose rather than configure: an inspector is a column of
 * `InspectorSection`s, each a column of `InspectorRow`s, each holding
 * whatever control the property needs. A row can hold two fields side
 * by side (x and y, width and height), each with its own short label.
 */

// ---------------------------------------------------------------------------
// The value of several things at once
// ---------------------------------------------------------------------------

/**
 * What one property of several chosen things is: the value they share,
 * or `mixed` when they differ. The value is the first one's when they
 * differ, so a control that has to show something has it; `mixed` says
 * not to.
 */
export interface SharedValue<T> {
  readonly value: T | undefined;
  readonly mixed: boolean;
}

/** The value `values` share, or mixed. None at all is `{ value: undefined, mixed: false }`. */
export function sharedValue<T>(values: readonly T[], equal: (a: T, b: T) => boolean = Object.is): SharedValue<T> {
  if (values.length === 0) {
    return { value: undefined, mixed: false };
  }
  const first = values[0];
  return { value: first, mixed: values.some(value => !equal(value, first)) };
}

// ---------------------------------------------------------------------------
// InspectorSection
// ---------------------------------------------------------------------------

export interface InspectorSectionProps extends ControlLayoutProps {
  /** The heading, and the name of the button that folds it. */
  title?: string;
  /** Whether it is open. Omit to let the section keep its own. */
  open?: boolean;
  /** Open at first, when the section keeps its own. Default true. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Controls at the end of the heading, as a + that adds a row. Not folded away with the content. */
  actions?: UiChild;
  /** The rows. */
  children?: UiChild;
}

/**
 * A heading that folds the rows under it. The heading is a button that
 * says `expanded` or `collapsed`, and a folded section's rows are not in
 * the tree at all.
 */
export function InspectorSection(inputs: Inputs<InspectorSectionProps>, _ctx: ComponentContext): UiChild {
  const title = input(inputs.title, '');
  const open = controlled<boolean>({
    component: 'InspectorSection',
    name: 'open',
    source: inputs.open,
    initial: inputs.defaultOpen,
    fallback: true,
    onChange: inputs.onOpenChange
  });
  const toggle = (): void => open.change(!open.current());
  return Column(
    { ...layoutOf(inputs), modifiers: modifiersOf(inputs), gap: 8 },
    Row(
      { y: 'center', gap: 4 },
      Row(
        {
          focusable: true,
          modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
          y: 'center',
          gap: 4,
          flexGrow: 1,
          paddingY: 4,
          borderRadius: 4,
          cursor: 'pointer',
          role: 'button',
          label: title,
          states: open.value.pipe(map(on => [on ? 'expanded' : 'collapsed'] as UiSemanticState[])),
          onClick: toggle,
          onKeyDown: keymap({ ' ': toggle, Enter: toggle })
        },
        chevron(open.value.pipe(map(on => (on ? CHEVRON_DOWN : CHEVRON_RIGHT))), 'textMuted', 12),
        Text({ text: title, color: 'text', textStyle: 'bodySmall', fontWeight: 600, selectable: false })
      ),
      followedChildren(inputs.actions, () => Row())
    ),
    open.value.pipe(
      map(on =>
        on
          ? [
              Column(
                { gap: 6 },
                followedChildren(inputs.children, () => Row())
              )
            ]
          : []
      )
    )
  );
}

// ---------------------------------------------------------------------------
// InspectorRow
// ---------------------------------------------------------------------------

export interface InspectorRowProps extends ControlLayoutProps {
  /** What the row is, drawn at its start. Empty for a row whose controls name themselves. */
  label?: string;
  /** The label's column, so the values of one section line up. Default 72. */
  labelWidth?: number;
  /** The control, or several side by side. */
  children?: UiChild;
}

/** A label and its value, the label in a column of its own so a section's values line up. */
export function InspectorRow(inputs: Inputs<InspectorRowProps>, _ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const labelWidth = input(inputs.labelWidth, 72);
  return Row(
    { ...layoutOf(inputs), modifiers: modifiersOf(inputs), y: 'center', gap: 8 },
    label.pipe(
      map(text =>
        text.length === 0
          ? []
          : [
              Text({
                text,
                width: labelWidth,
                flexShrink: 0,
                color: 'textMuted',
                textStyle: 'bodySmall',
                selectable: false
              })
            ]
      )
    ),
    Row(
      { y: 'center', gap: 8, flexGrow: 1, minWidth: 0 },
      followedChildren(inputs.children, () => Row())
    )
  );
}

// ---------------------------------------------------------------------------
// UnitField
// ---------------------------------------------------------------------------

/** How a nudge or a scrub is going: still moving, or let go. */
export type NudgePhase = 'live' | 'end';

export interface UnitFieldProps extends ControlLayoutProps {
  ref?: UiNodeRef;
  /** The value, in `unit`. Ignored while `mixed`. */
  value?: number;
  /** The chosen things differ: shows `Mixed` until a value is typed, scrubbed or stepped. */
  mixed?: boolean;
  /**
   * The field's name to a screen reader, and, unless `short` is given,
   * what is drawn at its start as the scrub handle.
   */
  label?: string;
  /** What is drawn at the start instead of the label: `X`, `W`, `°`. */
  short?: string;
  /** The unit the value is in, drawn after it: `mm`, `°`, `%`. */
  unit?: string;
  /**
   * Other units a value may be typed in, as how many of `unit` one of
   * each is: `{ cm: 10, m: 1000, in: 25.4 }` on a field in `mm`.
   */
  units?: Readonly<Record<string, number>>;
  min?: number;
  max?: number;
  /** What an arrow key or a scrub moves it by. Default 1; Shift is ten times, Alt a tenth. */
  step?: number;
  /** Decimal places shown. Default: as many as the value has, up to 4. */
  precision?: number;
  /** Pixels of drag per step when scrubbing. Default 2. */
  scrubPixels?: number;
  disabled?: boolean;
  /** A value while it is still changing: each step of a scrub, each arrow. */
  onChange?: (value: number) => void;
  /**
   * A value settled: typed and entered, the field left, a scrub let go,
   * an arrow pressed. One undo step each.
   */
  onCommit?: (value: number) => void;
  /**
   * Given this, arrows and scrubs report how far they moved instead of
   * a new value, live and then `end`: for a `mixed` field, where each
   * chosen thing moves from its own value, or for values that are
   * formulas, where `b/2` moved by 20 is `b/2+20`. Typing still commits
   * a value through `onCommit`.
   */
  onNudge?: (delta: number, phase: NudgePhase) => void;
}

/**
 * A number with a unit, as an inspector shows one.
 *
 * Typed: a number, or a number and one of `units` (`2 in` in a field in
 * mm is 50.8), entered with Enter or by leaving the field; Escape puts
 * back what it was. Stepped: Up and Down, by `step`, ten times that with
 * Shift and a tenth with Alt. Scrubbed: a drag along its label, a step
 * every `scrubPixels`, with the same keys. The keyboard does all of it:
 * the label is a handle for the pointer, not a stop for Tab.
 */
export function UnitField(inputs: Inputs<UnitFieldProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const short = input(inputs.short, '');
  const unit = input(inputs.unit, '');
  const mixed = input(inputs.mixed, false);
  const disabled = input(inputs.disabled, false);
  const step = input(inputs.step, 1);
  const min = input(inputs.min, Number.NEGATIVE_INFINITY);
  const max = input(inputs.max, Number.POSITIVE_INFINITY);
  const scrubPixels = input(inputs.scrubPixels, 2);
  const value = input(inputs.value, 0);
  const focus = trackFocus(ctx, inputs.ref);
  const tokens = themeTokenCell(controlTokens);

  const show = (n: number): string => format(n, inputs.precision.value);
  const shown = (): string => (mixed.value ? '' : show(value.value));
  /** The text in the field, which follows the value except while it is being typed. */
  const text = new BehaviorSubject(shown());
  /** Whether a scrub is in progress, and from what. */
  let scrub: { readonly x: number; readonly from: number; moved: number } | null = null;
  let editing = false;
  ctx.effect(combineLatest([value, mixed]), () => {
    if (!editing) {
      text.next(shown());
    }
  });

  const bound = (n: number): number => Math.min(max.value, Math.max(min.value, n));
  const change = (n: number): void => inputs.onChange.emit(n);
  const commit = (n: number): void => {
    text.next(show(n));
    inputs.onCommit.emit(n);
  };
  const nudging = (): boolean => inputs.onNudge.value !== undefined;
  const factor = (modifiers: UiKeyModifiers): number => (modifiers.shift ? 10 : modifiers.alt ? 0.1 : 1);

  const stepBy = (direction: 1 | -1, modifiers: UiKeyModifiers): void => {
    if (disabled.value) {
      return;
    }
    const delta = direction * step.value * factor(modifiers);
    editing = false;
    if (nudging()) {
      inputs.onNudge.emit(delta, 'end');
      return;
    }
    const next = bound(round(value.value + delta));
    change(next);
    commit(next);
  };

  const settle = (): void => {
    editing = false;
    const typed = text.value.trim();
    if (typed === '' || typed === shown()) {
      text.next(shown());
      return;
    }
    const parsed = parseQuantity(typed, unit.value, inputs.units.value);
    if (parsed === undefined) {
      text.next(shown());
      return;
    }
    commit(bound(parsed));
  };

  const field = EditableText({
    ref: focus.ref,
    modifiers: [CONTROL_FOCUS_RING],
    value: text,
    disabled,
    textWrap: 'none',
    flexGrow: 1,
    minWidth: 24,
    color: foregroundToken(disabled),
    placeholder: mixed.pipe(map(on => (on ? 'Mixed' : ''))),
    role: 'spinbutton',
    label,
    description: combineLatest([mixed, unit]).pipe(
      map(([on, name]) => [on ? 'Mixed values' : '', name === '' ? '' : `In ${name}`].filter(Boolean).join('. '))
    ),
    valueNow: combineLatest([value, mixed]).pipe(map(([n, on]) => (on ? undefined : n))),
    valueText: combineLatest([value, mixed, unit]).pipe(
      map(([n, on, name]) => (on ? 'Mixed' : `${show(n)}${name === '' ? '' : ` ${name}`}`))
    ),
    valueMin: min,
    valueMax: max,
    onInput: (event: UiTextChangeEvent) => {
      editing = true;
      text.next(event.value);
    },
    onBlur: settle,
    onKeyDown: (event: UiKeyboardEvent) => {
      if (event.key === 'Enter') {
        settle();
        return;
      }
      if (event.key === 'Escape' && editing) {
        editing = false;
        text.next(shown());
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        stepBy(event.key === 'ArrowUp' ? 1 : -1, event.modifiers);
      }
    }
  });

  const handle = Text({
    text: combineLatest([short, label]).pipe(map(([s, l]) => (s.length > 0 ? s : l))),
    color: 'textMuted',
    textStyle: 'bodySmall',
    flexShrink: 0,
    paddingRight: 4,
    selectable: false,
    cursor: disabled.pipe(map(off => (off ? undefined : 'ew-resize'))),
    onPanStart: (event: UiPointerEvent) => {
      if (disabled.value) {
        return;
      }
      scrub = { x: event.x, from: mixed.value ? 0 : value.value, moved: 0 };
    },
    onPanMove: (event: UiPointerEvent) => {
      if (scrub === null) {
        return;
      }
      const steps = Math.round((event.x - scrub.x) / Math.max(0.5, scrubPixels.value));
      const delta = round(steps * step.value * factor(event.modifiers));
      if (delta === scrub.moved) {
        return;
      }
      scrub.moved = delta;
      if (nudging()) {
        inputs.onNudge.emit(delta, 'live');
      } else {
        const next = bound(round(scrub.from + delta));
        text.next(show(next));
        change(next);
      }
    },
    onPanEnd: () => {
      if (scrub === null) {
        return;
      }
      const ended = scrub;
      scrub = null;
      if (nudging()) {
        inputs.onNudge.emit(ended.moved, 'end');
      } else if (ended.moved !== 0) {
        commit(bound(round(ended.from + ended.moved)));
      }
    }
  });

  return Row(
    {
      ...layoutOf(inputs),
      modifiers: modifiersOf(inputs, tokens.modifier),
      y: 'center',
      gap: 2,
      minWidth: 0,
      paddingX: 6,
      paddingY: 4,
      borderWidth: 1,
      borderColor: 'controlBorder',
      borderRadius: tokens.select(t => t.radius.field),
      backgroundColor: 'controlBackground'
    },
    handle,
    field,
    unit.pipe(
      map(name =>
        name === ''
          ? []
          : [Text({ text: name, color: 'textMuted', textStyle: 'bodySmall', flexShrink: 0, selectable: false })]
      )
    )
  );
}

/**
 * The value some typed text is, in `unit`: a number, optionally followed
 * by `unit` or one of `units`. Nothing for anything else.
 */
export function parseQuantity(
  text: string,
  unit: string,
  units: Readonly<Record<string, number>> | undefined
): number | undefined {
  const match = /^\s*([-+−]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([^\d\s.]*)\s*$/i.exec(text);
  if (match === null) {
    return undefined;
  }
  const number = Number(match[1].replace('−', '-'));
  const suffix = match[2];
  if (!Number.isFinite(number)) {
    return undefined;
  }
  if (suffix === '' || suffix === unit) {
    return number;
  }
  const per = units?.[suffix];
  return per === undefined ? undefined : number * per;
}

function round(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

function format(n: number, precision: number | undefined): string {
  if (!Number.isFinite(n)) {
    return '';
  }
  const places = precision ?? 4;
  const fixed = n.toFixed(places);
  // Trailing zeros go unless a precision was asked for.
  return precision === undefined ? String(Number(fixed)) : fixed;
}
