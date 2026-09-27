import { BehaviorSubject, combineLatest, map } from 'rxjs';

import { input, type ComponentContext, type Inputs, FocusService } from 'gesso-framework';
import { Box, Column, Row, Text, type UiChild, type UiElement, type UiNode, type UiSemanticState } from 'gesso-core';
import { CONTROL_INTERACTION, keymap } from './internals';
import { useOverlay, type OverlayPlacement } from './overlay';

/** One swatch: the colour, and what a screen reader calls it. */
export interface PaletteColor {
  readonly value: string;
  readonly name: string;
}

const HUES = ['red berry', 'red', 'orange', 'yellow', 'green', 'cyan', 'cornflower blue', 'blue', 'purple', 'magenta'];
const SHADES = ['light 3', 'light 2', 'light 1', '', 'dark 1', 'dark 2', 'dark 3'];

/**
 * The colours a palette offers when it is given none: a row of greys,
 * then ten hues, each from light to dark — the grid people already know
 * from every spreadsheet, and enough that a custom colour is the
 * exception it should be.
 */
export const PALETTE: readonly (readonly PaletteColor[])[] = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'].map(
    (value, at) => ({
      value,
      name: [
        'black',
        'dark grey 4',
        'dark grey 3',
        'dark grey 2',
        'dark grey 1',
        'grey',
        'light grey 1',
        'light grey 2',
        'light grey 3',
        'white'
      ][at]
    })
  ),
  ...(
    [
      ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
      ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
      ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
      ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
      ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
      ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
      ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
    ] as const
  ).map((row, shade) =>
    row.map((value, hue) => ({
      value,
      name: `${SHADES[shade]} ${HUES[hue]}`.trim().replace(/^(light|dark) (\d) (.*)$/, '$1 $3 $2')
    }))
  )
];

/**
 * A colour chosen from a grid, anchored to whatever opened it.
 *
 * Built as `Menu` is: the caller owns the trigger and whether it is
 * open, and the palette owns the keyboard while it is. The arrows walk
 * the grid, Home and End go to the ends of a row, Enter and Space choose,
 * Escape closes, and focus is trapped so none of them reach the page.
 *
 * Above the grid, the choice that means *no colour of its own* — the
 * text's automatic colour, or no fill — and a row of what was used
 * recently, so the second cell painted the same colour is one press.
 * The colour chosen now is ringed.
 */
export interface ColorPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The node the palette sits beside. */
  anchor?: UiNode | null;
  placement?: OverlayPlacement;
  /** The colour now, as `#rrggbb`; empty for the automatic one. */
  value?: string;
  /** A colour chosen, as `#rrggbb`, or empty for the automatic one. */
  onSelect?: (color: string) => void;
  /** What the choice of no colour is called: "Automatic", "No fill". */
  automaticLabel?: string;
  /** Colours used lately, most recent first; at most a row of them is shown. */
  recent?: readonly string[];
  /** The rows of swatches; `PALETTE` when not given. */
  colors?: readonly (readonly PaletteColor[])[];
  /** What the palette is called: "Text colour", "Fill colour". */
  label?: string;
}

/** Where the keyboard is in the grid: a row, and a place along it. */
interface At {
  readonly row: number;
  readonly column: number;
}

export function ColorPalette(inputs: Inputs<ColorPaletteProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Colour');
  const placement = input(inputs.placement, 'bottom-start');
  const automatic = input(inputs.automaticLabel, 'Automatic');
  const focus = ctx.inject(FocusService);
  const overlay = useOverlay(ctx, 'color-palette');
  const active = new BehaviorSubject<At>({ row: 0, column: 0 });
  let trapped = false;
  let placeholder: UiNode | null = null;

  /** Every row the keyboard walks: the automatic choice, the recent colours, then the grid. */
  const rows = (): readonly (readonly PaletteColor[])[] => {
    const recent = (inputs.recent.value ?? []).slice(0, 10).map(value => ({ value, name: `recent ${value}` }));
    return [
      [{ value: '', name: automatic.value }],
      ...(recent.length === 0 ? [] : [recent]),
      ...(inputs.colors.value ?? PALETTE)
    ];
  };

  const release = (): void => {
    if (trapped) {
      trapped = false;
      focus.releaseTrap();
    }
  };
  ctx.onUnmount(release);

  const close = (): void => {
    if (overlay.isOpen()) {
      overlay.hide();
    }
  };

  const choose = (value?: string): void => {
    const all = rows();
    const at = active.value;
    const chosen = value ?? all[at.row]?.[at.column]?.value;
    if (chosen === undefined) {
      return;
    }
    inputs.onSelect.value?.(chosen);
    close();
  };

  const move = (rowBy: number, columnBy: number): void => {
    const all = rows();
    const at = active.value;
    const row = Math.max(0, Math.min(all.length - 1, at.row + rowBy));
    const length = all[row].length;
    // Along a row it wraps, as a list does; into another row it keeps
    // the column as near as that row allows.
    const column =
      rowBy === 0 ? (((at.column + columnBy) % length) + length) % length : Math.min(at.column, length - 1);
    active.next({ row, column });
  };

  /** Where the colour now is, so the keyboard starts on it. */
  const startAt = (): At => {
    const value = (inputs.value.value ?? '').toLowerCase();
    const all = rows();
    for (let row = all.length - 1; row >= 0; row--) {
      const column = all[row].findIndex(color => color.value.toLowerCase() === value);
      if (column !== -1) {
        return { row, column };
      }
    }
    return { row: 0, column: 0 };
  };

  const swatch = (color: PaletteColor, row: number, column: number): UiElement => {
    const lit = active.pipe(map(at => at.row === row && at.column === column));
    const chosen = input(inputs.value, '').pipe(map(value => value.toLowerCase() === color.value.toLowerCase()));
    return Box({
      key: `${row}-${column}`,
      modifiers: [CONTROL_INTERACTION],
      width: 18,
      height: 18,
      borderRadius: 3,
      backgroundColor: color.value,
      borderColor: combineLatest([lit, chosen]).pipe(
        map(([on, picked]) => (on ? 'focusRing' : picked ? 'text' : 'border'))
      ),
      borderWidth: combineLatest([lit, chosen]).pipe(map(([on, picked]) => (on || picked ? 2 : 1))),
      cursor: 'pointer',
      role: 'option',
      label: color.name,
      states: chosen.pipe(map((picked): UiSemanticState[] => (picked ? ['selected'] : []))),
      onPointerEnter: () => active.next({ row, column }),
      onClick: () => choose(color.value)
    });
  };

  const automaticRow = (color: PaletteColor): UiElement => {
    const lit = active.pipe(map(at => at.row === 0));
    const chosen = input(inputs.value, '').pipe(map(value => value === ''));
    return Row(
      {
        key: 'automatic',
        modifiers: [CONTROL_INTERACTION],
        y: 'center',
        gap: 8,
        padding: 6,
        borderRadius: 4,
        backgroundColor: lit.pipe(map(on => (on ? 'controlBackgroundHovered' : 'transparent'))),
        role: 'option',
        label: color.name,
        states: chosen.pipe(map((picked): UiSemanticState[] => (picked ? ['selected'] : []))),
        onPointerEnter: () => active.next({ row: 0, column: 0 }),
        onClick: () => choose('')
      },
      Box({
        width: 18,
        height: 18,
        borderRadius: 3,
        borderColor: 'border',
        borderWidth: 1,
        backgroundColor: 'background'
      }),
      Text({ text: color.name, fontSize: 12, color: 'controlForeground', selectable: false })
    );
  };

  const body = (): UiElement => {
    const all = rows();
    const hasRecent = (inputs.recent.value ?? []).length > 0;
    return Column(
      {
        ref: (node: UiNode | null) => {
          if (node !== null && !trapped) {
            trapped = true;
            focus.trap(node);
          }
        },
        focusable: true,
        padding: 8,
        gap: 3,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 8,
        role: 'listbox',
        label: label.value,
        onKeyDown: keymap({
          ArrowRight: () => move(0, 1),
          ArrowLeft: () => move(0, -1),
          ArrowDown: () => move(1, 0),
          ArrowUp: () => move(-1, 0),
          Home: () => active.next({ row: active.value.row, column: 0 }),
          End: () => active.next({ row: active.value.row, column: all[active.value.row].length - 1 }),
          Enter: () => choose(),
          ' ': () => choose(),
          Escape: close
        })
      },
      automaticRow(all[0][0]),
      ...all.slice(1).map((colors, at) => {
        const row = at + 1;
        // A gap under the recent row and under the greys, where people read one.
        const gapAfter = (hasRecent && row === 1) || row === (hasRecent ? 2 : 1);
        return Row(
          { key: `row-${row}`, gap: 3, marginBottom: gapAfter ? 5 : 0 },
          ...colors.map((color, column) => swatch(color, row, column))
        );
      })
    );
  };

  inputs.open.subscribe(isOpen => {
    if (isOpen === true && !overlay.isOpen()) {
      active.next(startAt());
      overlay.show(body(), {
        anchor: inputs.anchor.value ?? null,
        environment: inputs.anchor.value ?? placeholder,
        placement: placement.value,
        offset: 4,
        dismissOnOutsidePress: true,
        onClose: () => {
          release();
          inputs.onOpenChange.value?.(false);
        }
      });
    } else if (isOpen !== true && overlay.isOpen()) {
      overlay.hide();
    }
  });

  return Row({ ref: (node: UiNode | null) => (placeholder = node), visible: false, width: 0, height: 0 });
}

/** A colour's value as `#rrggbb`, lower case, or null when it is not one. */
export function normalizeHex(text: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (match === null) {
    return null;
  }
  const digits = match[1].length === 3 ? [...match[1]].map(digit => digit + digit).join('') : match[1];
  return `#${digits.toLowerCase()}`;
}
