import { BehaviorSubject, map } from 'rxjs';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  Column,
  EditableText,
  linearGradient,
  measure,
  Paint,
  Row,
  type LayoutBox,
  type PaintSurface,
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
 *
 * **Opacity is opt-in.** With `alpha`, a strip under the hue bar sets
 * how opaque the colour is, over a checkerboard so that see-through
 * looks see-through, and the colour is written and reported as
 * `#rrggbbaa`. Without it nothing changes: the picker says `#rrggbb`
 * and does not take a value with alpha.
 */
export interface ColorPickerProps {
  /**
   * The colour, as `#rrggbb`. With `alpha`, `#rrggbbaa` too, and a
   * colour without alpha is read as fully opaque.
   */
  value?: string;
  /** Told the colour on every move: `#rrggbb`, or always `#rrggbbaa` with `alpha`. */
  onChange?: (color: string) => void;
  /** What the picker is called, for a screen reader. */
  label?: string;
  /** The square's width; the bar and the field follow it. Read once, when the picker is built. */
  width?: number;
  /**
   * Whether the colour has an opacity: a strip to set it, and hex with
   * two more digits. Off by default. Read once, when the picker is built.
   */
  alpha?: boolean;
}

export function ColorPicker(inputs: Inputs<ColorPickerProps>, _ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Colour');
  const width = inputs.width?.value ?? 200;
  const height = Math.round(width * 0.62);
  const alpha = inputs.alpha?.value === true;
  // Without alpha a colour is read exactly as it always was, so an
  // eight-digit value is still not one; with it, both lengths are.
  const parse = (text: string): Solid | null => {
    if (alpha) {
      return parseHexAlpha(text);
    }
    const solid = normalizeHex(text);
    return solid === null ? null : { solid, opacity: 1 };
  };
  const write = (solid: string, opacity: number): string => (alpha ? solid + byte(opacity) : solid);
  const start = parse(inputs.value?.value ?? '') ?? { solid: '#000000', opacity: 1 };
  const hsv = new BehaviorSubject<Hsv>(hsvOfHex(start.solid));
  /** How opaque the colour is, 0 to 1; always 1 without `alpha`. */
  const opacity = new BehaviorSubject(start.opacity);
  /** The colour now, as it is reported, for the swatch; apart from the field's text, which may be on its way to one. */
  const color = new BehaviorSubject(write(start.solid, start.opacity));
  /** The field's text. */
  const draft = new BehaviorSubject(color.value);
  const square = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const bar = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const strip = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });

  // A value written from outside is followed, unless it is the one this
  // picker just reported — a hue of a grey is lost in `#rrggbb`, and
  // taking the echo back would throw away the hue somebody was on.
  let reported = '';
  input(inputs.value, '').subscribe(value => {
    const parsed = parse(value);
    if (parsed === null) {
      return;
    }
    const normal = write(parsed.solid, parsed.opacity);
    if (normal !== reported) {
      hsv.next(hsvOfHex(parsed.solid));
      opacity.next(parsed.opacity);
      color.next(normal);
      draft.next(normal);
    }
  });

  const report = (): void => {
    const hex = write(hexOfHsv(hsv.value), opacity.value);
    color.next(hex);
    draft.next(hex);
    reported = hex;
    inputs.onChange.value?.(hex);
  };

  const set = (next: Hsv): void => {
    hsv.next({ h: ((next.h % 360) + 360) % 360, s: clamp(next.s), v: clamp(next.v) });
    report();
  };

  const setOpacity = (next: number): void => {
    opacity.next(clamp(next));
    report();
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

  const inStrip = (event: UiPointerEvent): void => {
    event.stopPropagation();
    const box = strip.value;
    if (box.width > 0) {
      setOpacity((event.x - box.x) / box.width);
    }
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

  const stripKeys = (event: UiKeyboardEvent): void => {
    const by = event.modifiers.shift === true ? 0.1 : 0.01;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? by
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -by
          : 0;
    if (next !== 0) {
      event.preventDefault();
      event.stopPropagation();
      setOpacity(opacity.value + next);
    }
  };

  const typed = (event: UiTextChangeEvent): void => {
    // The field keeps what was typed: "#1a2" is a colour on the way to
    // "#1a2b3c", and writing it back as "#11aa22" would wreck the typing.
    draft.next(event.value);
    const parsed = parse(event.value);
    if (parsed !== null) {
      const normal = write(parsed.solid, parsed.opacity);
      color.next(normal);
      const next = hsvOfHex(parsed.solid);
      // A grey has no hue of its own; the one somebody was on is kept.
      hsv.next(next.s === 0 ? { ...next, h: hsv.value.h } : next);
      opacity.next(parsed.opacity);
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
        // Held still before it moved, a press arrives as a Drag; see `Slider`.
        onDragStart: inSquare,
        onDragMove: inSquare,
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
        // Held still before it moved, a press arrives as a Drag; see `Slider`.
        onDragStart: inBar,
        onDragMove: inBar,
        onKeyDown: barKeys
      },
      hsv.pipe(map(at => marker((at.h / 360) * width, 7)))
    ),
    ...(alpha
      ? [
          Paint(
            {
              modifiers: [measure(strip)],
              position: 'relative',
              width,
              height: 14,
              cursor: 'pointer',
              focusable: true,
              role: 'slider',
              label: `${label.value}: opacity`,
              valueText: opacity.pipe(map(at => `${Math.round(at * 100)}%`)),
              // The colour itself, from none of it to all of it, over the
              // checkerboard that shows what none of it means.
              paint: hsv.pipe(
                map(at => {
                  const solid = hexOfHsv(at);
                  return {
                    draw: (surface: PaintSurface) => {
                      checkerboard(surface, width, 14, 7);
                      surface.fillGradient(
                        linearGradient(Math.PI / 2, [{ color: `${solid}00` }, { color: solid }]),
                        0,
                        0,
                        width,
                        14
                      );
                      surface.beginPath();
                      surface.roundRect(0, 0, width, 14, 7);
                      surface.fill();
                    },
                    inputs: [solid]
                  };
                })
              ),
              onPointerDown: inStrip,
              onPanStart: inStrip,
              onPanMove: inStrip,
              // Held still before it moved, a press arrives as a Drag; see `Slider`.
              onDragStart: inStrip,
              onDragMove: inStrip,
              onKeyDown: stripKeys
            },
            opacity.pipe(map(at => marker(at * width, 7)))
          )
        ]
      : []),
    Row(
      { gap: 8, y: 'center' },
      alpha
        ? Paint({
            width: 28,
            height: 28,
            role: 'image',
            label: color.pipe(map(hex => `${label.value}: ${hex}`)),
            // Drawn rather than a background, so the checkerboard is
            // under the colour and both keep inside the rounded border.
            paint: color.pipe(
              map(hex => ({
                draw: (surface: PaintSurface) => {
                  checkerboard(surface, 28, 28, 4);
                  surface.fillColor(hex);
                  surface.beginPath();
                  surface.roundRect(0, 0, 28, 28, 4);
                  surface.fill();
                  surface.strokeColor('border');
                  surface.lineWidth(1);
                  surface.beginPath();
                  surface.roundRect(0.5, 0.5, 27, 27, 3.5);
                  surface.stroke();
                },
                inputs: [hex]
              }))
            )
          })
        : Box({
            width: 28,
            height: 28,
            borderRadius: 4,
            borderColor: 'border',
            borderWidth: 1,
            backgroundColor: color,
            role: 'image',
            label: color.pipe(map(hex => `${label.value}: ${hex}`))
          }),
      EditableText({
        value: draft,
        width: width - 36,
        textStyle: 'bodySmall',
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

/** A colour as `#rrggbb` and how opaque it is, 0 to 1. */
interface Solid {
  readonly solid: string;
  readonly opacity: number;
}

/**
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, the hash optional, as a
 * solid colour and an opacity; null when it is none of them. Kept apart
 * from `normalizeHex`, which a palette uses and which must go on saying
 * that eight digits are not a colour.
 */
function parseHexAlpha(text: string): Solid | null {
  const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
  if (match === null) {
    return null;
  }
  const short = match[1].length <= 4;
  const digits = (short ? [...match[1]].map(digit => digit + digit).join('') : match[1]).toLowerCase();
  const opacity = digits.length === 8 ? Number.parseInt(digits.slice(6), 16) / 255 : 1;
  return { solid: `#${digits.slice(0, 6)}`, opacity };
}

/** An opacity, 0 to 1, as the two hex digits it takes at the end of `#rrggbbaa`. */
function byte(opacity: number): string {
  return Math.round(clamp(opacity) * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * The grey squares that stand for nothing at all, behind a colour that
 * may be partly see-through, clipped to the rounded shape the colour is
 * drawn in. Fixed greys rather than palette names: it shows the colour's
 * opacity, not the theme, and should look the same in both.
 */
function checkerboard(surface: PaintSurface, width: number, height: number, radius: number): void {
  const cell = 7;
  surface.save();
  surface.beginPath();
  surface.roundRect(0, 0, width, height, radius);
  surface.clip();
  surface.fillColor('#ffffff');
  surface.beginPath();
  surface.rect(0, 0, width, height);
  surface.fill();
  surface.fillColor('#cccccc');
  surface.beginPath();
  for (let row = 0; row * cell < height; row++) {
    for (let column = row % 2; column * cell < width; column += 2) {
      surface.rect(column * cell, row * cell, cell, cell);
    }
  }
  surface.fill();
  surface.restore();
}
