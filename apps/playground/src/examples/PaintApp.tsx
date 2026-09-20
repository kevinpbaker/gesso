import { BehaviorSubject, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Paint, type PaintSurface, type UiChild, type UiPaint, type UiPath } from '@gesso/core';
import { type ComponentContext, type Inputs, internalState } from '@gesso/framework';
import {
  ACCENT,
  BORDER,
  BORDER_SOFT,
  gessoTheme,
  GROUND,
  LINEN,
  MONO,
  POSITIVE,
  SURFACE_RAISED,
  TEXT,
  TEXT_MUTED
} from './brand';
import { isStill } from '../shell/still';

/**
 * Painting: the drawing an application does for itself.
 *
 * Everything else in Gesso is reachable by a property. This page is
 * the part that is reachable by a function: a `paint` node is handed a
 * `PaintSurface`, its resolved box and the device scale, and draws
 * whatever the property set has no name for. A `path` node is the same
 * capability stated declaratively, for a shape that does not change.
 *
 * The two things worth reading for are the two the design turns on.
 *
 *   - **The surface names no backend.** A painter never sees a canvas,
 *     a context or a device, and nothing on this page is written twice.
 *     Switch the renderer with the button in the header: the sparkline
 *     and the gauge are drawn by the same code on Canvas2D and on
 *     WebGPU, because the calls are recorded once and rasterised once
 *     and both backends draw the result.
 *   - **The painter runs when its inputs change, and not per frame.**
 *     `UiPaint.inputs` is what says so. The sparkline's painter is
 *     rebuilt when a sample arrives, four times a second; the gauge's
 *     when the dial moves; the paths' and the ribbon's never. On a
 *     frame where nothing has changed the page draws nine pictures it
 *     already has and runs no drawing code at all.
 *
 * Colours are palette names wherever the shape is part of the
 * interface, so a painted node follows the light and dark toggle the
 * way every other node does: the name is resolved against whatever
 * theme the node inherits, at the moment the picture is made.
 */

const CARD_WIDTH = 340;
const SPARK_POINTS = 48;

// ---------------------------------------------------------------------------
// A sparkline: the smallest thing that could not be built from props
// ---------------------------------------------------------------------------

/**
 * The painter for a series, as one value.
 *
 * The series array is the input, so the picture is remade when a
 * sample arrives and reused on every frame in between. Note what the
 * painter reads off the box: the width and height it was actually
 * given, and `scale`, which turns a hairline into one physical pixel
 * rather than one logical one.
 */
function sparklinePainter(series: readonly number[], color: string): UiPaint {
  return {
    inputs: [series, color],
    draw(surface: PaintSurface, box) {
      const step = box.width / Math.max(1, series.length - 1);
      const y = (value: number): number => box.height - 4 - value * (box.height - 8);

      // The area under the line, in the line's own colour at a
      // quarter. `alpha` multiplies into the opacity already in force,
      // and `save` and `restore` scope it, so the stroke below is not
      // faded with it.
      surface.beginPath();
      surface.moveTo(0, box.height);
      series.forEach((value, index) => surface.lineTo(index * step, y(value)));
      surface.lineTo(box.width, box.height);
      surface.closePath();
      surface.save();
      surface.alpha(0.25);
      surface.fillColor(color);
      surface.fill();
      surface.restore();

      // The line itself, and a dot on the newest sample.
      surface.beginPath();
      series.forEach((value, index) => {
        const px = index * step;
        const py = y(value);
        if (index === 0) {
          surface.moveTo(px, py);
        } else {
          surface.lineTo(px, py);
        }
      });
      surface.strokeColor(color);
      surface.lineWidth(1.5);
      surface.lineJoin('round');
      surface.lineCap('round');
      surface.stroke();

      surface.beginPath();
      surface.arc(box.width, y(series[series.length - 1]), 3, 0, Math.PI * 2);
      surface.fillColor(color);
      surface.fill();

      // A baseline, dashed, at half. Dashes, caps and joins are all
      // part of the vocabulary rather than something a painter has to
      // approximate with rectangles.
      surface.beginPath();
      surface.moveTo(0, y(0.5));
      surface.lineTo(box.width, y(0.5));
      surface.strokeColor(BORDER);
      surface.lineWidth(1 / box.scale);
      surface.lineDash([3, 3]);
      surface.stroke();
    }
  };
}

/** A rolling series that gains a sample four times a second. */
class Series {
  private readonly values: number[] = Array.from({ length: SPARK_POINTS }, (_, i) => 0.5 + 0.3 * Math.sin(i / 5));
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly latest = new BehaviorSubject<readonly number[]>([...this.values]);

  start(): void {
    if (this.timer !== null || isStill()) {
      return;
    }
    this.timer = setInterval(() => {
      const previous = this.values[this.values.length - 1];
      const next = Math.min(0.98, Math.max(0.02, previous + (Math.random() - 0.5) * 0.35));
      this.values.push(next);
      this.values.shift();
      this.latest.next([...this.values]);
    }, 250);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function SparklineCard(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const series = new Series();
  ctx.onMount(() => series.start());
  ctx.onUnmount(() => series.stop());
  const painter: Observable<UiPaint> = series.latest.pipe(map(values => sparklinePainter(values, ACCENT)));

  return Card(
    'Sparkline',
    'A rolling series, repainted when a sample arrives and not once per frame.',
    Paint({ height: 72, width: CARD_WIDTH - 32, paint: painter })
  );
}

// ---------------------------------------------------------------------------
// A gauge: arcs, a text child over the picture, and a value that moves
// ---------------------------------------------------------------------------

function gaugePainter(value: number): UiPaint {
  return {
    inputs: [value],
    draw(surface, box) {
      const cx = box.width / 2;
      // The dial sits above centre so the reading has the lower half
      // of the box to itself, which is where a gauge puts it.
      const cy = box.height / 2 - 10;
      const radius = Math.min(cx, box.height / 2) - 12;
      const start = Math.PI * 0.8;
      const sweep = Math.PI * 1.4;

      surface.lineCap('round');
      surface.beginPath();
      surface.arc(cx, cy, radius, start, start + sweep);
      surface.strokeColor('border');
      surface.lineWidth(10);
      surface.stroke();

      surface.beginPath();
      surface.arc(cx, cy, radius, start, start + sweep * value);
      surface.strokeColor(value > 0.85 ? LINEN : POSITIVE);
      surface.lineWidth(10);
      surface.stroke();

      // The needle, drawn under a rotation the painter asks for
      // itself. Transforms are part of the surface, so nothing here
      // does trigonometry it does not have to.
      surface.save();
      surface.translate(cx, cy);
      surface.rotate(start + sweep * value);
      surface.beginPath();
      surface.moveTo(-4, 0);
      surface.lineTo(radius - 14, -1.5);
      surface.lineTo(radius - 14, 1.5);
      surface.closePath();
      surface.fillColor('text');
      surface.fill();
      surface.restore();

      surface.beginPath();
      surface.arc(cx, cy, 4, 0, Math.PI * 2);
      surface.fillColor('text');
      surface.fill();
    }
  };
}

function GaugeCard(_inputs: Inputs<{}>, ctx: ComponentContext) {
  const value = internalState(isStill() ? 0.62 : 0.35);
  let timer: ReturnType<typeof setInterval> | null = null;
  ctx.onMount(() => {
    if (isStill()) {
      return;
    }
    timer = setInterval(() => {
      value.value = Math.min(0.98, Math.max(0.05, value.value + (Math.random() - 0.45) * 0.18));
    }, 700);
  });
  ctx.onUnmount(() => {
    if (timer !== null) {
      clearInterval(timer);
    }
  });

  return Card(
    'Gauge',
    'Arcs, a rotation and a needle. The reading under it is an ordinary text child stacked over the picture.',
    Paint(
      {
        height: 150,
        width: CARD_WIDTH - 32,
        x: 'center',
        y: 'end',
        paddingBottom: 4,
        paint: value.pipe(map(gaugePainter))
      },
      <text
        text={value.pipe(map(v => `${Math.round(v * 100)}%`))}
        fontSize={24}
        fontWeight={600}
        color={TEXT}
        fontFamily={MONO}
      />
    )
  );
}

// ---------------------------------------------------------------------------
// A path: the declarative half
// ---------------------------------------------------------------------------

/** A mark with a hole in it, so the fill rule has something to decide. */
const BADGE: UiPath = {
  d: 'M12 1.5 L22 6.5 L22 13 C22 18 17.5 21.5 12 22.5 C6.5 21.5 2 18 2 13 L2 6.5 Z M12 6 L7 9 L12 12 L17 9 Z',
  viewBox: 24,
  fill: 'primary',
  fillRule: 'evenodd'
};

/** The same geometry, stroked instead, with round caps and joins. */
const BADGE_OUTLINE: UiPath = {
  d: BADGE.d,
  viewBox: 24,
  stroke: 'text',
  strokeWidth: 1.5,
  lineCap: 'round',
  lineJoin: 'round'
};

/** A dashed ring, which is what a `path` costs when it is decoration. */
const DASHED_RING: UiPath = {
  d: 'M12 2 A10 10 0 1 1 11.99 2 Z',
  viewBox: 24,
  stroke: 'secondary',
  strokeWidth: 2,
  dash: [3, 2.5],
  lineCap: 'round'
};

function PathCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return Card(
    'Path',
    'Static vector shapes as a property: SVG path data, a fill rule, a stroke, dashes, caps and joins.',
    <row gap={16} y="center">
      {Paint({ width: 64, height: 64, path: BADGE })}
      {Paint({ width: 64, height: 64, path: BADGE_OUTLINE })}
      {Paint({ width: 64, height: 64, path: DASHED_RING })}
    </row>
  );
}

// ---------------------------------------------------------------------------
// Clip and blur: the two a design asks for first
// ---------------------------------------------------------------------------

const RIBBON: UiPaint = {
  inputs: [],
  draw(surface, box) {
    for (let i = 0; i < 9; i++) {
      surface.beginPath();
      surface.moveTo((box.width * i) / 8, 0);
      surface.lineTo((box.width * (i + 1)) / 8, box.height);
      surface.lineTo((box.width * (i + 2)) / 8, box.height);
      surface.lineTo((box.width * (i + 1)) / 8, 0);
      surface.closePath();
      surface.fillColor(i % 2 === 0 ? ACCENT : LINEN);
      surface.fill();
    }
  }
};

function MaskCard(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const side = 96;
  // A rounded mask, as path data in the node's own logical pixels.
  const rounded = `M24 0 H${side - 24} A24 24 0 0 1 ${side} 24 V${side - 24} A24 24 0 0 1 ${side - 24} ${side} H24 A24 24 0 0 1 0 ${side - 24} V24 A24 24 0 0 1 24 0 Z`;
  return Card(
    'Clip and blur',
    'A rounded mask and a frosted panel, both shaping the picture the node drew.',
    <row gap={16} y="center">
      {Paint({ width: side, height: side, paint: RIBBON })}
      {Paint({ width: side, height: side, paint: RIBBON, clipPath: rounded })}
      {Paint({ width: side, height: side, paint: RIBBON, clipPath: rounded, blur: 6 })}
    </row>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/** One card, through the factory: a title, a caption and the demo. */
function Card(title: string, caption: string, body: UiChild): UiChild {
  return (
    <column
      width={CARD_WIDTH}
      gap={10}
      padding={16}
      backgroundColor={SURFACE_RAISED}
      borderRadius={10}
      borderWidth={1}
      borderColor={BORDER_SOFT}>
      <text text={title} fontSize={14} fontWeight={600} color={TEXT} />
      <text text={caption} fontSize={12} color={TEXT_MUTED} lineHeight={17} />
      {body}
    </column>
  );
}

export function PaintApp(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  // The root provides the palette so that the names the painters use
  // ('border', 'text', 'primary', 'secondary') resolve against it. That
  // is the whole of what a painted node has to do to follow an
  // appearance change: a picture is remade when the node's environment
  // is replaced, which is what a theme swap does.
  return (
    <scrollview backgroundColor={GROUND} theme={gessoTheme} padding={20} gap={16} flexWrap="wrap" x="start">
      <row gap={16} y="start" flexWrap="wrap">
        <SparklineCard />
        <GaugeCard />
      </row>
      <row gap={16} y="start" flexWrap="wrap">
        <PathCard />
        <MaskCard />
      </row>
    </scrollview>
  );
}
