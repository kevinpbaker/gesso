---
description: 'DatePicker: a calendar date chosen from a month, as a YYYY-MM-DD string, operable from the keyboard alone, with its props, keys and grid semantics.'
---

# DatePicker

A calendar date, chosen from a month. The value is a `YYYY-MM-DD`
string, `''` for none, because a calendar date isn't an instant: a
`Date` at local midnight, read back in UTC, is the day before, and a
string has no time zone to be a day out in.

<LiveExample id="datepicker" height="520" />

<<< @/src/examples/DatePickerExample.tsx#date-picker

Each date bounds the other through `min` and `max`. Open Due date and
press Down: the cursor moves a week, and Enter takes it. Open Start date
and press PageDown: a month on is past the due date, so the cursor stops
there.

## Props

| Prop           | Type                      | Default     | What it does                                                                           |
| -------------- | ------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `value`        | `string`                  | none        | The date, `YYYY-MM-DD` or `''`, when the application owns it.                          |
| `defaultValue` | `string`                  | none        | The date to start on, when the picker owns it.                                         |
| `onChange`     | `(value: string) => void` | none        | Called with the date chosen, or `''` from Clear.                                       |
| `label`        | `string`                  | `''`        | Drawn above the trigger, and the name of the trigger and the calendar.                 |
| `labelHidden`  | `boolean`                 | `false`     | The label still names the trigger but isn't drawn.                                     |
| `placeholder`  | `string`                  | `'No date'` | Drawn in the trigger with no date.                                                     |
| `description`  | `string`                  | `''`        | Shown under the trigger and read after its name.                                       |
| `error`        | `string`                  | `''`        | What's wrong, shown in place of the description; implies `invalid`.                    |
| `invalid`      | `boolean`                 | `false`     | Draws the border in `danger` and adds the `invalid` state.                             |
| `required`     | `boolean`                 | `false`     | Adds the `required` state. It enforces nothing.                                        |
| `disabled`     | `boolean`                 | `false`     | Refuses presses and keys, and greys the trigger.                                       |
| `min`, `max`   | `string`                  | `''`        | The earliest and latest dates that can be chosen. Days outside are greyed and refused. |
| `weekStart`    | `number`                  | `1`         | The first day of a week: `0` for Sunday, `1` for Monday.                               |
| `clearable`    | `boolean`                 | `true`      | Offers Clear, to go back to no date.                                                   |
| `today`        | `string`                  | local date  | The date that counts as today. For a spec or a demo that must show the same month.     |
| `locale`       | `string`                  | runtime's   | A language tag for the names of days and months.                                       |
| `ref`          | `UiNodeRef`               | none        | Receives the trigger.                                                                  |

The date arithmetic is exported for an application that works in the
same strings: `parseIsoDate`, `isoDate`, `todayIso`, `addDays`,
`addMonths`, `monthGrid` and `formatDate`.

## Keyboard

On the trigger, `Enter`, `Space` or `Down` opens the calendar on the
chosen date, or on today when there is none. The calendar is a dialog
that traps focus, and focus starts in the grid of days.

| Key                  | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `Left`, `Right`      | The day before or after                           |
| `Up`, `Down`         | The same day a week before or after               |
| `Home`, `End`        | The first or last day of the week                 |
| `PageUp`, `PageDown` | The same day a month before or after              |
| With `Shift`         | A year before or after                            |
| `Enter`, `Space`     | Chooses the day and closes                        |
| `Escape`             | Closes without choosing                           |
| `Tab`                | The month buttons, the grid, then Today and Clear |

The cursor never leaves `min` and `max`; a move past either stops on it.
A month move keeps the day where the month has it and takes the month's
last day where it doesn't. Closing, for any reason, hands focus back to
the trigger.

## Semantics

The trigger is a `combobox`, `expanded` or `collapsed`, whose value is
the date read out in full ("Tuesday, October 20, 2026"). The calendar is
a `dialog` holding a `grid` named for its month; its rows are `row`s,
the weekday names `columnheader`s, and the days `gridcell`s named in
full and marked `selected` when chosen. The grid holds focus and names
the day under the cursor as its `activeDescendant`, so a screen reader
reads each day as the arrows reach it. The month name above the grid is
a polite live region, so turning the page is announced.
