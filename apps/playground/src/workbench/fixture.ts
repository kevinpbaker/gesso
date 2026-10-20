import type { UiChild } from 'gesso-core';

/**
 * One way of showing a component in the workbench: a name, what a
 * person should do with it, and a function that builds it.
 *
 * `render` is a function rather than a tree so every mount builds a
 * fresh one. The workbench rebuilds a state when its theme, direction
 * or width changes and when Reset is pressed, and a tree built once at
 * module load would carry the last person's typing into the next.
 */
export interface WorkbenchState {
  /** Short, and unique within its component: `Disabled`, `Long label`. */
  readonly name: string;
  /**
   * What to try and what should happen, in a sentence or two:
   * "Tab onto it: a focus ring appears. Space presses it." This is the
   * checklist a person works through, so it says what correct looks
   * like rather than describing the props.
   */
  readonly try?: string;
  /**
   * Width of the cell the state is drawn in, when the default of 280
   * is wrong for it: a data table wants room, a narrow width is how an
   * overflow state is shown.
   */
  readonly width?: number;
  /**
   * Stretch the component across the cell rather than leaving it at the
   * width it asks for: a text field, a progress bar, anything that is
   * meant to fill its parent.
   */
  readonly stretch?: boolean;
  /** Height of the cell, for a component that fills its parent. */
  readonly height?: number;
  readonly render: () => UiChild;
}

/** Every state of one component, as one page of the workbench. */
export interface WorkbenchFixture {
  /** The url segment: `#workbench/date-picker`. */
  readonly id: string;
  /** The name as exported: `DatePicker`. */
  readonly name: string;
  /** Where the component lives, repository relative. */
  readonly source: string;
  readonly states: readonly WorkbenchState[];
}
