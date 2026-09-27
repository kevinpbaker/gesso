import { BehaviorSubject, map } from 'rxjs';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  Column,
  EditableText,
  linearGradient,
  measure,
  Row,
  type LayoutBox,
  type UiChild,
  type UiKeyboardEvent,
  type UiPointerEvent,
  type UiTextChangeEvent
} from 'gesso-core';
import { normalizeHex } from './ColorPalette';

/** A colour as hue (0–360), saturation and value (both 0–1). */
export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

/** `#rrggbb` as hue, saturation and value; black for anything that is not a colour. */
export function hsvOfHex(hex: string): Hsv {
  const normal = normalizeHex(hex) ?? '#000000';
  const value = Number.parseInt(normal.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const chroma = high - low;
  let h = 0;
  if (chroma > 0) {
    h = high === r ? ((g - b) / chroma + 6) % 6 : high === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  }
  return { h: h * 60, s: high === 0 ? 0 : chroma / high, v: high };
}

/** Hue, saturation and value as `#rrggbb`. */
export function hexOfHsv({ h, s, v }: Hsv): string {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const byte = (x: number): string =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(f(5))}${byte(f(3))}${byte(f(1))}`;
}

/**
 * Any colour at all: a square of saturation against brightness, a bar
 * of hues, and the colour written as `#rrggbb` — for the colour a
 * palette does not have, which is usually one somebody is matching.
 *
 * A panel, not an overlay: whatever holds it — a dialog, a popover —
 * decides when it shows. `onChange` is told on every move, so what holds
 * it can show the colour as it is dragged and keep it or not.
 *
 * **Operable from the keyboard alone.** The square and the bar each take
 * the arrows (Shift for a bigger step), and the field takes a colour
 * typed or pasted, which is how a colour from elsewhere arrives.
 */
export interface ColorPickerProps {
  /** The colour, as `#rrggbb`. */
  value?: string;
  onChange?: (color: string) => void;
  /** What the picker is called, for a screen reader. */
  label?: string;
  /** The square's width; the bar and the field follow it. */
  width?: number;
}

export function ColorPicker(inputs: Inputs<ColorPickerProps>, _ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Colour');
  const width = inputs.width?.value ?? 200;
  const height = Math.round(width * 0.62);
  const hsv = new BehaviorSubject<Hsv>(hsvOfHex(inputs.value?.value ?? '#000000'));
  const draft = new BehaviorSubject(normalizeHex(inputs.value?.value ?? '') ?? '#000000');
  const square = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const bar = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });

  // A value written from outside is followed, unless it is the one this
  // picker just reported — a hue of a grey is lost in `#rrggbb`, and
  // taking the echo back would throw away the hue somebody was on.
  let reported = '';
  input(inputs.value, '').subscribe(value => {
    const normal = normalizeHex(value);
    if (normal !== null && normal !== reported) {
      hsv.next(hsvOfHex(normal));
      draft.next(normal);
    }
  });

  const set = (next: Hsv): void => {
    const bounded = { h: ((next.h % 360) + 360) % 360, s: clamp(next.s), v: clamp(next.v) };
    hsv.next(bounded);
    const hex = hexOfHsv(bounded);
    draft.next(hex);
    reported = hex;
    inputs.onChange.value?.(hex);
  };

  const inSquare = (event: UiPointerEvent): void => {
    event.stopPropagation();
    const box = square.value;
    if (box.width <= 0 || box.height <= 0) {
      return;
    }
    set({ ...hsv.value, s: (event.x - box.x) / box.width, v: 1 - (event.y - box.y) / box.height });
  };

  const inBar = (event: UiPointerEvent): void => {
    event.stopPropagation();
    const box = bar.value;
    if (box.width <= 0) {
      return;
    }
    // Short of 360 at the right end, which is red again and would jump the square.
    set({ ...hsv.value, h: clamp((event.x - box.x) / box.width) * 359.9 });
  };

  const squareKeys = (event: UiKeyboardEvent): void => {
    const by = event.modifiers.shift === true ? 0.1 : 0.01;
    const at = hsv.value;
    const moves: Record<string, Hsv> = {
      ArrowRight: { ...at, s: at.s + by },
      ArrowLeft: { ...at, s: at.s - by },
      ArrowUp: { ...at, v: at.v + by },
      ArrowDown: { ...at, v: at.v - by }
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      set(next);
    }
  };

  const barKeys = (event: UiKeyboardEvent): void => {
    const by = event.modifiers.shift === true ? 30 : 3;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? by
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -by
          : 0;
    if (next !== 0) {
      event.preventDefault();
      event.stopPropagation();
      set({ ...hsv.value, h: Math.min(359.9, Math.max(0, hsv.value.h + next)) });
    }
  };

  const typed = (event: UiTextChangeEvent): void => {
    const normal = normalizeHex(event.value);
    if (normal !== null) {
      const next = hsvOfHex(normal);
      // A grey has no hue of its own; the one somebody was on is kept.
      hsv.next(next.s === 0 ? { ...next, h: hsv.value.h } : next);
      reported = normal;
      inputs.onChange.value?.(normal);
    }
  };

  const marker = (left: number, top: number): UiChild =>
    Box({
      position: 'absolute',
      left: left - 6,
      top: top - 6,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderColor: '#ffffff',
      borderWidth: 2,
      pointerEvents: 'none'
    });

  return Column(
    { gap: 10, role: 'group', label: label.value },
    Box(
      {
        modifiers: [measure(square)],
        position: 'relative',
        width,
        height,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'crosshair',
        focusable: true,
        role: 'slider',
        label: `${label.value}: saturation and brightness`,
        valueText: hsv.pipe(map(at => `saturation ${Math.round(at.s * 100)}%, brightness ${Math.round(at.v * 100)}%`)),
        backgroundColor: hsv.pipe(map(at => hexOfHsv({ h: at.h, s: 1, v: 1 }))),
        onPointerDown: inSquare,
        onPanStart: inSquare,
        onPanMove: inSquare,
        onKeyDown: squareKeys
      },
      Box({
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: 'none',
        backgroundGradient: linearGradient(Math.PI / 2, [{ color: '#ffffff' }, { color: 'rgba(255, 255, 255, 0)' }])
      }),
      Box({
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: 'none',
        backgroundGradient: linearGradient(Math.PI, [{ color: 'rgba(0, 0, 0, 0)' }, { color: '#000000' }])
      }),
      hsv.pipe(map(at => marker(at.s * width, (1 - at.v) * height)))
    ),
    Box(
      {
        modifiers: [measure(bar)],
        position: 'relative',
        width,
        height: 14,
        borderRadius: 7,
        cursor: 'pointer',
        focusable: true,
        role: 'slider',
        label: `${label.value}: hue`,
        valueText: hsv.pipe(map(at => `${Math.round(at.h)} degrees`)),
        backgroundGradient: linearGradient(
          Math.PI / 2,
          ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].map(color => ({ color }))
        ),
        onPointerDown: inBar,
        onPanStart: inBar,
        onPanMove: inBar,
        onKeyDown: barKeys
      },
      hsv.pipe(map(at => marker((at.h / 360) * width, 7)))
    ),
    Row(
      { gap: 8, y: 'center' },
      Box({
        width: 28,
        height: 28,
        borderRadius: 4,
        borderColor: 'border',
        borderWidth: 1,
        backgroundColor: draft,
        role: 'image',
        label: draft.pipe(map(hex => `${label.value}: ${hex}`))
      }),
      EditableText({
        value: draft,
        width: width - 36,
        fontSize: 12,
        fontFamily: 'monospace',
        color: 'text',
        textWrap: 'none',
        backgroundColor: 'background',
        borderColor: 'border',
        borderWidth: 1,
        padding: 5,
        role: 'textbox',
        label: `${label.value} as hex`,
        onInput: typed
      })
    )
  );
}

function clamp(x: number): number {
  return Math.min(1, Math.max(0, x));
}
