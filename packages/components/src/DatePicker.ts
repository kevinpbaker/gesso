import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import { controlled, FocusService, input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  autoFocus,
  Box,
  Button,
  Column,
  Row,
  Text,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiNodeRef,
  type UiSemanticState
} from 'gesso-core';
import { addDays, addMonths, clampDate, formatDate, monthGrid, parseIsoDate, startOfWeek, todayIso } from './calendar';
import { chevron, CHEVRON_DOWN } from './chevron';
import { trackFocus } from './focus';
import { controlDescription, controlMessage } from './message';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  borderToken,
  foregroundToken,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';
import { useOverlay } from './overlay';

/**
 * A calendar date, chosen from a month.
 *
 * The value is a `YYYY-MM-DD` string, `''` for none: a calendar date is
 * not an instant, and a string has no time zone to be a day out in.
 *
 * The trigger shows the date in the reader's language and opens a
 * calendar under it. The calendar is a dialog: focus is trapped in it,
 * the month's days are a grid that holds focus, and the day the cursor
 * is on is the grid's `activeDescendant`, so a screen reader reads each
 * day as the arrows reach it.
 *
 * **Operable from the keyboard alone.** On the trigger, Enter, Space or
 * Down opens the calendar on the chosen date (or today). In the grid
 * the arrows move a day or a week, Home and End go to the week's start
 * and end, PageUp and PageDown a month (with Shift, a year), Enter or
 * Space chooses, and Escape closes without choosing. Tab reaches the
 * month buttons and, below the grid, Today and Clear.
 */
export interface DatePickerProps extends ControlLayoutProps {
  /** `YYYY-MM-DD`, or `''` for no date. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  /** The label names the control but isn't drawn above it. */
  labelHidden?: boolean;
  /** Drawn in the trigger with no date chosen. */
  placeholder?: string;
  description?: string;
  error?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** The earliest date that can be chosen, `YYYY-MM-DD`. */
  min?: string;
  /** The latest. */
  max?: string;
  /** 0 for Sunday, 1 for Monday. Default 1. */
  weekStart?: number;
  /** Offers Clear, to go back to no date. Default true. */
  clearable?: boolean;
  /**
   * The date that counts as today, `YYYY-MM-DD`: where the calendar
   * opens with nothing chosen, what Today chooses, and the day marked.
   * The local date by default; a spec or a demo that must show the same
   * month every time passes one.
   */
  today?: string;
  /** A language tag for the names of days and months; the runtime's by default. */
  locale?: string;
  /** Receives the trigger. */
  ref?: UiNodeRef;
}

const TRIGGER_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
const DAY_NAME: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const MONTH_NAME: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long' };
const WEEKDAY_SHORT: Intl.DateTimeFormatOptions = { weekday: 'short' };

export function DatePicker(inputs: Inputs<DatePickerProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, '');
  const labelHidden = inputs.labelHidden?.value === true;
  const placeholder = input(inputs.placeholder, 'No date');
  const description = input(inputs.description, '');
  const error = input(inputs.error, '');
  const disabled = input(inputs.disabled, false);
  const required = input(inputs.required, false);
  const min = input(inputs.min, '');
  const max = input(inputs.max, '');
  const clearable = input(inputs.clearable, true);
  const weekStart = inputs.weekStart?.value ?? 1;
  const locale = inputs.locale?.value;
  const today = (): string => inputs.today?.value ?? todayIso();
  const invalid = combineLatest([input(inputs.invalid, false), error]).pipe(
    map(([marked, message]) => marked || message.length > 0)
  );
  const focusStore = ctx.inject(FocusService);
  const focus = trackFocus(ctx, inputs.ref);
  const overlay = useOverlay(ctx, 'date-picker');
  const value = controlled<string>({
    component: 'DatePicker',
    name: 'value',
    source: inputs.value,
    initial: inputs.defaultValue,
    fallback: '',
    onChange: inputs.onChange
  });

  /** The day the grid's cursor is on; its month is the month shown. */
  const cursor = new BehaviorSubject(today());
  const cells = new Map<string, UiNode>();
  const cellsChanged = new BehaviorSubject(0);
  let trapped = false;

  const inRange = (day: string): boolean =>
    (min.value === '' || day >= min.value) && (max.value === '' || day <= max.value);

  const release = (): void => {
    if (trapped) {
      trapped = false;
      focusStore.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  };

  const choose = (day: string): void => {
    if (!inRange(day)) {
      return;
    }
    value.change(day);
    close();
  };

  const moveTo = (day: string): void => cursor.next(clampDate(day, min.value, max.value));

  const gridKeys = (event: UiKeyboardEvent): void => {
    const day = cursor.value;
    const shift = event.modifiers.shift;
    const bindings: Record<string, () => void> = {
      ArrowLeft: () => moveTo(addDays(day, -1)),
      ArrowRight: () => moveTo(addDays(day, 1)),
      ArrowUp: () => moveTo(addDays(day, -7)),
      ArrowDown: () => moveTo(addDays(day, 7)),
      Home: () => moveTo(startOfWeek(day, weekStart)),
      End: () => moveTo(addDays(startOfWeek(day, weekStart), 6)),
      PageUp: () => moveTo(addMonths(day, shift ? -12 : -1)),
      PageDown: () => moveTo(addMonths(day, shift ? 12 : 1)),
      Enter: () => choose(day),
      ' ': () => choose(day),
      Escape: close
    };
    const handler = bindings[event.key];
    if (handler !== undefined) {
      handler();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const monthLabel = cursor.pipe(
    map(day => formatDate(day, MONTH_NAME, locale)),
    distinctUntilChanged()
  );
  const activeCell = combineLatest([cursor, cellsChanged]).pipe(
    map(([day]) => cells.get(day) ?? null),
    distinctUntilChanged()
  );

  const weekdayNames = (): string[] => {
    const monday = '2024-01-01';
    const first = addDays(monday, weekStart - 1);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i)).map(day => formatDate(day, WEEKDAY_SHORT, locale));
  };

  const calendar = (): UiElement =>
    Column(
      {
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focusStore.trap(node);
          }
        },
        role: 'dialog',
        label,
        padding: 10,
        gap: 8,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 10
      },
      Row(
        { y: 'center', gap: 4 },
        stepButton('‹', 'Previous month', () => moveTo(addMonths(cursor.value, -1))),
        Text({
          text: monthLabel,
          live: 'polite',
          fontWeight: 600,
          flexGrow: 1,
          textAlign: 'center',
          selectable: false
        }),
        stepButton('›', 'Next month', () => moveTo(addMonths(cursor.value, 1)))
      ),
      Column(
        {
          focusable: true,
          // On its first layout, once it's under the trap: the grid,
          // not the month buttons before it, is where the keys are.
          modifiers: [CONTROL_FOCUS_RING, autoFocus()],
          role: 'grid',
          label: monthLabel,
          activeDescendant: activeCell,
          onKeyDown: gridKeys,
          gap: 2,
          borderRadius: 6
        },
        Row(
          { role: 'row', gap: 2 },
          ...weekdayNames().map(name =>
            Text({
              key: name,
              text: name,
              role: 'columnheader',
              width: 34,
              fontSize: 11,
              color: 'textMuted',
              textAlign: 'center',
              selectable: false
            })
          )
        ),
        cursor.pipe(
          map(day => day.slice(0, 7)),
          distinctUntilChanged(),
          map(month =>
            monthGrid(month, weekStart).map(week =>
              Row(
                { key: week[0], role: 'row', gap: 2 },
                ...week.map(day =>
                  dayCell(
                    day,
                    month,
                    today(),
                    cursor,
                    value.value,
                    inRange(day),
                    choose,
                    locale,
                    (node: UiNode | null) => {
                      if (node === null) {
                        cells.delete(day);
                      } else {
                        cells.set(day, node);
                      }
                      cellsChanged.next(cellsChanged.value + 1);
                    }
                  )
                )
              )
            )
          )
        )
      ),
      Row(
        { gap: 6, x: 'end' },
        textButton('Today', 'Today', () => {
          const now = today();
          if (inRange(now)) {
            choose(now);
          } else {
            moveTo(now);
          }
        }),
        combineLatest([clearable, value.value]).pipe(
          map(([can, chosen]) =>
            can && chosen !== ''
              ? [
                  textButton('Clear', 'Clear date', () => {
                    value.change('');
                    close();
                  })
                ]
              : []
          )
        )
      )
    );

  const open = (): void => {
    if (disabled.value || overlay.isOpen()) {
      return;
    }
    const chosen = value.current();
    cursor.next(clampDate(parseIsoDate(chosen) === null ? today() : chosen, min.value, max.value));
    overlay.show(calendar(), {
      anchor: focus.node(),
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true,
      onClose: release
    });
  };

  const shown = combineLatest([value.value, placeholder]).pipe(
    map(([chosen, empty]) => (parseIsoDate(chosen) === null ? empty : formatDate(chosen, TRIGGER_FORMAT, locale)))
  );

  return Column(
    { ...layoutOf(inputs), gap: 4 },
    label.pipe(
      map(text =>
        text.length === 0 || labelHidden
          ? []
          : [Text({ text, color: foregroundToken(disabled), fontSize: 12, selectable: false })]
      )
    ),
    Row(
      {
        ref: focus.ref,
        focusable: true,
        disabled,
        modifiers: modifiersOf(inputs, CONTROL_INTERACTION, CONTROL_FOCUS_RING),
        y: 'center',
        padding: 8,
        gap: 8,
        backgroundColor: 'controlBackground',
        borderWidth: 1,
        borderColor: borderToken(invalid),
        borderRadius: 6,
        role: 'combobox',
        label,
        description: controlDescription(error, description),
        valueText: value.value.pipe(
          map(chosen => (parseIsoDate(chosen) === null ? '' : formatDate(chosen, DAY_NAME, locale)))
        ),
        states: states(overlay.open, invalid, required),
        onClick: () => (overlay.isOpen() ? close() : open()),
        onKeyDown: (event: UiKeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            open();
            event.preventDefault();
            event.stopPropagation();
          }
        }
      },
      Text({
        text: shown,
        color: value.value.pipe(map(chosen => (chosen === '' ? 'textMuted' : 'controlForeground'))),
        flexGrow: 1,
        textWrap: 'none',
        selectable: false
      }),
      chevron(CHEVRON_DOWN, foregroundToken(disabled))
    ),
    controlMessage(error, description)
  );
}

function dayCell(
  day: string,
  month: string,
  todayIs: string,
  cursor: Observable<string>,
  chosen: Observable<string>,
  enabled: boolean,
  choose: (day: string) => void,
  locale: string | undefined,
  track: (node: UiNode | null) => void
): UiElement {
  const selected = chosen.pipe(map(value => value === day));
  const atCursor = cursor.pipe(map(value => value === day));
  const today = day === todayIs;
  const outside = !day.startsWith(month);
  return Box(
    {
      key: day,
      ref: track,
      role: 'gridcell',
      label: formatDate(day, DAY_NAME, locale),
      disabled: !enabled,
      states: selected.pipe(map(on => (on ? (['selected'] as UiSemanticState[]) : []))),
      modifiers: [CONTROL_INTERACTION],
      width: 34,
      height: 30,
      x: 'center',
      y: 'center',
      borderRadius: 6,
      borderWidth: atCursor.pipe(map(on => (on ? 2 : today ? 1 : 0))),
      borderColor: atCursor.pipe(map(on => (on ? 'controlAccent' : 'controlBorder'))),
      backgroundColor: selected.pipe(map(on => (on ? 'controlAccent' : 'transparent'))),
      onClick: () => choose(day)
    },
    Text({
      text: String(Number(day.slice(8))),
      fontWeight: today ? 700 : 400,
      color: combineLatest([selected]).pipe(
        map(([on]) =>
          on
            ? 'controlBackground'
            : !enabled
              ? 'controlForegroundDisabled'
              : outside
                ? 'textMuted'
                : 'controlForeground'
        )
      ),
      selectable: false
    })
  );
}

function stepButton(glyph: string, name: string, onClick: () => void): UiElement {
  return Button(
    {
      label: name,
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
      width: 28,
      height: 28,
      borderRadius: 6,
      x: 'center',
      y: 'center',
      onClick
    },
    Text({ text: glyph, color: 'controlForeground', selectable: false })
  );
}

function textButton(text: string, name: string, onClick: () => void): UiElement {
  return Button(
    {
      key: name,
      label: name,
      modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
      paddingLeft: 10,
      paddingRight: 10,
      paddingTop: 4,
      paddingBottom: 4,
      borderRadius: 6,
      onClick
    },
    Text({ text, fontSize: 12, color: 'controlForeground', selectable: false })
  );
}

function states(
  open: Observable<boolean>,
  invalid: Observable<boolean>,
  required: Observable<boolean>
): Observable<UiSemanticState[]> {
  return combineLatest([open, invalid, required]).pipe(
    map(([isOpen, bad, must]) => {
      const result: UiSemanticState[] = [isOpen ? 'expanded' : 'collapsed'];
      if (bad) {
        result.push('invalid');
      }
      if (must) {
        result.push('required');
      }
      return result;
    })
  );
}
