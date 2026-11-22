import { combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import { bounds, controlled, input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  Box,
  Paint,
  Row,
  Text,
  transform,
  UiWheelDeltaMode,
  type LayoutBox,
  type PaintSurface,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiNode,
  type UiPinchEvent,
  type UiPointerEvent,
  type UiWheelEvent
} from 'gesso-core';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { zoomStep } from './StatusBar';

/**
 * Where a viewport looks: the content's point at its top-left corner,
 * in the content's own units, and how far it is zoomed, 1 for 100%.
 */
export interface ViewportCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The sizes a camera is worked out against: the content's, and the viewport's on screen. */
export interface ViewportFrame {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly width: number;
  readonly height: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

/**
 * A surface that pans and zooms: a diagram, a board, a circuit, a sheet
 * of parts to cut. The content is laid out at its own size and drawn
 * through a camera, so everything in it stays what it was (buttons press,
 * text selects, a `CanvasEditor` edits, at any zoom).
 *
 * **Moving around.** Mod or Ctrl with the wheel, or a pinch, zooms about
 * the pointer; the wheel alone pans, as a trackpad's two fingers do.
 * Dragging pans too: on the background, with the middle button anywhere,
 * or anywhere with Space held, so content that takes its own drags (an
 * editor's shapes) keeps them. Focused, the viewport pans with the arrows
 * (further with Shift), zooms with `+` and `-`, goes to 100% with `0`
 * and fits everything with `1`.
 *
 * **Fitting.** With no camera given it starts with the whole content in
 * view, and follows the window as it is resized, until the person moves
 * it. `fitCamera` is the same fit, for an application's own command.
 *
 * **Minimap and controls.** `minimap` draws the whole content small in a
 * corner, with the part in view outlined; a press or a drag on it moves
 * the view there. `minimapPaint` draws the content in it, which is
 * otherwise a plain block. `controls` adds −, the zoom, + and Fit in the
 * other corner.
 */
export interface ViewportProps extends ControlLayoutProps {
  /** What is looked at, laid out at `contentWidth` × `contentHeight`. */
  content: UiChild;
  contentWidth: number;
  contentHeight: number;
  camera?: ViewportCamera;
  defaultCamera?: ViewportCamera;
  onCameraChange?: (camera: ViewportCamera) => void;
  /** Default 0.1, and 4. */
  minZoom?: number;
  maxZoom?: number;
  /** Whether a drag on the background pans. Default true. Read once. */
  panOnBackground?: boolean;
  /** Draws the minimap. Read once. */
  minimap?: boolean;
  /** Draws the content in the minimap, in content units scaled by `scale`. */
  minimapPaint?: (surface: PaintSurface, scale: number) => void;
  /** Draws the zoom controls. Read once. */
  controls?: boolean;
  /** The viewport's name. Default "Canvas". */
  label?: string;
}

/** The room kept around fitted content, in pixels on screen. */
const FIT_PADDING = 24;
/** How much of the content stays in view however far it is panned, in pixels on screen. */
const KEEP = 48;
/** How far a press moves before it is a drag, in pixels. */
const SLOP = 3;
const ARROW = 40;
const BIG_ARROW = 200;
/** The most one wheel event zooms, so a notch with Ctrl held steps rather than leaps. */
const WHEEL_STEP = 1.25;
const WHEEL_RATE = 0.0025;
const MINIMAP_MAX = 160;

const clampZoom = (zoom: number, frame: ViewportFrame): number =>
  Math.min(frame.maxZoom, Math.max(frame.minZoom, zoom));

/** The camera kept so at least a little of the content stays in view. */
export function clampCamera(camera: ViewportCamera, frame: ViewportFrame): ViewportCamera {
  const zoom = clampZoom(camera.zoom, frame);
  const keep = KEEP / zoom;
  const x = Math.min(frame.contentWidth - keep, Math.max(keep - frame.width / zoom, camera.x));
  const y = Math.min(frame.contentHeight - keep, Math.max(keep - frame.height / zoom, camera.y));
  return { x, y, zoom };
}

/**
 * The camera with the whole content in view, centred, never enlarged past
 * 100%: a small diagram is shown at its size, not blown up to the window.
 */
export function fitCamera(frame: ViewportFrame): ViewportCamera {
  const room = (extent: number) => Math.max(1, extent - FIT_PADDING * 2);
  const zoom = clampZoom(
    Math.min(
      1,
      room(frame.width) / Math.max(1, frame.contentWidth),
      room(frame.height) / Math.max(1, frame.contentHeight)
    ),
    frame
  );
  return {
    x: frame.contentWidth / 2 - frame.width / 2 / zoom,
    y: frame.contentHeight / 2 - frame.height / 2 / zoom,
    zoom
  };
}

/** The camera zoomed by `factor` about a point in the viewport, so the content under it stays under it. */
export function zoomCameraAt(
  camera: ViewportCamera,
  at: { readonly x: number; readonly y: number },
  factor: number,
  frame: ViewportFrame
): ViewportCamera {
  const zoom = clampZoom(camera.zoom * factor, frame);
  return clampCamera(
    { zoom, x: camera.x + at.x / camera.zoom - at.x / zoom, y: camera.y + at.y / camera.zoom - at.y / zoom },
    frame
  );
}

const NOWHERE: LayoutBox = { x: 0, y: 0, width: 0, height: 0 };

export function Viewport(inputs: Inputs<ViewportProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Canvas');
  const minZoom = input(inputs.minZoom, 0.1);
  const maxZoom = input(inputs.maxZoom, 4);
  const panOnBackground = inputs.panOnBackground?.value !== false;
  const box = bounds('Viewport');
  const given = inputs.camera.value !== undefined || inputs.defaultCamera.value !== undefined;
  const camera = controlled<ViewportCamera>({
    component: 'Viewport',
    name: 'camera',
    source: inputs.camera,
    initial: inputs.defaultCamera,
    fallback: { x: 0, y: 0, zoom: 1 },
    onChange: inputs.onCameraChange
  });

  let root: UiNode | null = null;
  /** Whether the view is the one a fit chose: then a resize fits it again, until the person moves it. */
  let fitted = !given;

  const frame = (): ViewportFrame => {
    const at = box.value ?? NOWHERE;
    return {
      contentWidth: inputs.contentWidth.value,
      contentHeight: inputs.contentHeight.value,
      width: at.width,
      height: at.height,
      minZoom: minZoom.value,
      maxZoom: maxZoom.value
    };
  };
  const move = (next: ViewportCamera): void => {
    fitted = false;
    const current = camera.current();
    if (next.x !== current.x || next.y !== current.y || next.zoom !== current.zoom) camera.change(next);
  };
  const fit = (): void => {
    const f = frame();
    if (f.width <= 0 || f.height <= 0) return;
    fitted = true;
    camera.change(fitCamera(f));
  };
  const zoomAt = (at: { x: number; y: number }, factor: number): void =>
    move(zoomCameraAt(camera.current(), at, factor, frame()));
  const zoomTo = (zoom: number): void => {
    const f = frame();
    zoomAt({ x: f.width / 2, y: f.height / 2 }, zoom / camera.current().zoom);
  };
  const panBy = (dx: number, dy: number): void => {
    const c = camera.current();
    move(clampCamera({ ...c, x: c.x + dx / c.zoom, y: c.y + dy / c.zoom }, frame()));
  };
  /** The zooms −, + and the keys step through: a browser's, within this viewport's limits. */
  const step = (delta: 1 | -1): number => {
    const f = frame();
    const steps = [f.minZoom, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4, 6, 8, f.maxZoom]
      .filter(each => each >= f.minZoom && each <= f.maxZoom)
      .sort((a, b) => a - b);
    return zoomStep(camera.current().zoom, delta, steps);
  };

  // Fitted when it first has a size, and again as it or the content changes size while it is.
  ctx.effect(combineLatest([box, inputs.contentWidth, inputs.contentHeight]), ([at]) => {
    if (fitted && at.width > 0 && at.height > 0) fit();
  });

  const local = (event: { readonly x: number; readonly y: number }) => {
    const at = box.value ?? NOWHERE;
    return { x: event.x - at.x, y: event.y - at.y };
  };

  /** A press that may become a pan: where it was, and whether it has moved past the slop. */
  let press: { x: number; y: number; moved: boolean } | null = null;
  let space = false;

  /**
   * Whether a press landed on something of the content's own: a node that
   * takes focus (a button, a field, an editor) between it and the
   * viewport, or one that kept the press for itself. A press anywhere
   * else is on the background, however the content's boxes are nested.
   */
  const pressedContent = (event: UiPointerEvent): boolean => {
    if (event.defaultPrevented) return true;
    for (let node: UiNode | null = event.target as UiNode | null; node !== null && node !== root; node = node.parent) {
      if (node.properties.get('focusable') === true) return true;
    }
    return false;
  };

  const onPointerDown = (event: UiPointerEvent): void => {
    const middle = (event.buttons & 4) !== 0;
    const background = panOnBackground && !pressedContent(event);
    if (middle || space || background) {
      press = { x: event.x, y: event.y, moved: false };
      if (middle || space) event.preventDefault();
    }
  };
  const onPointerMove = (event: UiPointerEvent): void => {
    if (press === null || event.buttons === 0) return;
    const dx = event.x - press.x;
    const dy = event.y - press.y;
    if (!press.moved && Math.hypot(dx, dy) < SLOP) return;
    press.moved = true;
    event.stopPropagation();
    panBy(-dx, -dy);
    press.x = event.x;
    press.y = event.y;
  };

  const onWheel = (event: UiWheelEvent): void => {
    const unit = event.deltaMode === UiWheelDeltaMode.Line ? 16 : event.deltaMode === UiWheelDeltaMode.Page ? 400 : 1;
    const mods = event.modifiers;
    event.preventDefault();
    if (mods.ctrl || mods.meta) {
      const factor = Math.min(WHEEL_STEP, Math.max(1 / WHEEL_STEP, Math.exp(-event.deltaY * unit * WHEEL_RATE)));
      zoomAt(local(event), factor);
      return;
    }
    // Shift turns a mouse's one wheel sideways, where the platform hasn't already.
    const sideways = mods.shift && event.deltaX === 0;
    panBy((sideways ? event.deltaY : event.deltaX) * unit, (sideways ? 0 : event.deltaY) * unit);
  };

  const onKeyDown = (event: UiKeyboardEvent): void => {
    // Only its own keys: what is inside it, an editor or a field, keeps the arrows.
    if (event.target !== root) return;
    const far = event.modifiers.shift ? BIG_ARROW : ARROW;
    const handled = ((): boolean => {
      switch (event.key) {
        case 'ArrowLeft':
          panBy(-far, 0);
          return true;
        case 'ArrowRight':
          panBy(far, 0);
          return true;
        case 'ArrowUp':
          panBy(0, -far);
          return true;
        case 'ArrowDown':
          panBy(0, far);
          return true;
        case '+':
        case '=':
          zoomTo(step(1));
          return true;
        case '-':
          zoomTo(step(-1));
          return true;
        case '0':
          zoomTo(1);
          return true;
        case '1':
          fit();
          return true;
        case ' ':
          space = true;
          return true;
        default:
          return false;
      }
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const percent = camera.value.pipe(
    map(c => `${Math.round(c.zoom * 100)}%`),
    distinctUntilChanged()
  );
  const worldTransform = camera.value.pipe(
    map(c => transform({ translateX: -c.x * c.zoom, translateY: -c.y * c.zoom, scaleX: c.zoom, scaleY: c.zoom }))
  );

  const overlays: UiElement[] = [];
  if (inputs.minimap.value === true) overlays.push(minimap());
  if (inputs.controls.value === true) overlays.push(controls());

  function minimap(): UiElement {
    const scaleOf = (w: number, h: number): number =>
      Math.min(MINIMAP_MAX / Math.max(w, 1), MINIMAP_MAX / Math.max(h, 1));
    const size = combineLatest([inputs.contentWidth, inputs.contentHeight]).pipe(
      map(([w, h]) => {
        const scale = scaleOf(w, h);
        return { width: Math.max(40, w * scale), height: Math.max(30, h * scale), scale };
      })
    );
    const paint = combineLatest([camera.value, box, size, inputs.minimapPaint]).pipe(
      map(([c, at, m, draw]) => ({
        inputs: [c.x, c.y, c.zoom, at.width, at.height, m.scale, draw],
        draw: (surface: PaintSurface) => {
          surface.save();
          if (draw === undefined) {
            surface.fillColor('controlBackground');
            surface.beginPath();
            surface.rect(0, 0, inputs.contentWidth.value * m.scale, inputs.contentHeight.value * m.scale);
            surface.fill();
          } else {
            draw(surface, m.scale);
          }
          surface.restore();
          surface.strokeColor('primary');
          surface.lineWidth(1.5);
          surface.beginPath();
          surface.rect(c.x * m.scale, c.y * m.scale, (at.width / c.zoom) * m.scale, (at.height / c.zoom) * m.scale);
          surface.stroke();
        }
      }))
    );
    const mapBox = bounds('Viewport.minimap');
    /** Centres the view on the content under the pointer on the minimap. */
    const centreOn = (event: UiPointerEvent): void => {
      const m = scaleOf(inputs.contentWidth.value, inputs.contentHeight.value);
      const at = mapBox.value ?? NOWHERE;
      const c = camera.current();
      const f = frame();
      move(
        clampCamera(
          { ...c, x: (event.x - at.x) / m - f.width / 2 / c.zoom, y: (event.y - at.y) / m - f.height / 2 / c.zoom },
          f
        )
      );
    };
    let dragging = false;
    return Box(
      {
        key: 'minimap',
        position: 'absolute',
        right: 12,
        bottom: 12,
        padding: 4,
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 6,
        cursor: 'pointer',
        onPointerDown: (event: UiPointerEvent) => {
          event.stopPropagation();
          dragging = true;
          centreOn(event);
        },
        onPointerMove: (event: UiPointerEvent) => {
          if (!dragging || event.buttons === 0) return;
          event.stopPropagation();
          centreOn(event);
        },
        onPointerUp: () => (dragging = false)
      },
      Paint({
        modifiers: [mapBox.modifier],
        width: size.pipe(map(m => m.width)),
        height: size.pipe(map(m => m.height)),
        paint,
        pointerEvents: 'none'
      })
    );
  }

  function controls(): UiElement {
    const button = (name: string | Observable<string>, text: string | Observable<string>, press: () => void) =>
      Row(
        {
          modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
          focusable: true,
          role: 'button',
          label: name,
          minWidth: 28,
          height: 28,
          paddingX: 6,
          x: 'center',
          y: 'center',
          borderRadius: 4,
          onClick: press,
          onKeyDown: (event: UiKeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              press();
            }
          }
        },
        Text({ text, color: 'controlForeground', textStyle: 'bodySmall', selectable: false })
      );
    return Row(
      {
        key: 'controls',
        position: 'absolute',
        left: 12,
        bottom: 12,
        gap: 2,
        padding: 2,
        y: 'center',
        backgroundColor: 'surface',
        borderColor: 'border',
        borderWidth: 1,
        borderRadius: 6,
        role: 'group',
        label: 'Zoom'
      },
      button('Zoom out', '−', () => zoomTo(step(-1))),
      button(percent.pipe(map(p => `Zoom ${p}, reset to 100%`)), percent, () => zoomTo(1)),
      button('Zoom in', '+', () => zoomTo(step(1))),
      button('Fit', 'Fit', fit)
    );
  }

  return Box(
    {
      ...layoutOf(inputs),
      ref: (node: UiNode | null) => (root = node),
      modifiers: modifiersOf(inputs, box.modifier, CONTROL_FOCUS_RING),
      position: 'relative',
      overflow: 'hidden',
      focusable: true,
      role: 'group',
      label,
      description: percent.pipe(map(p => `Zoom ${p}`)),
      cursor: 'grab',
      onPointerDown,
      onPointerMove,
      onPointerUp: () => (press = null),
      onWheel,
      onPinchMove: (event: UiPinchEvent) => zoomAt(local(event), event.scaleDelta),
      onKeyDown,
      onKeyUp: (event: UiKeyboardEvent) => {
        if (event.key === ' ') space = false;
      },
      onBlur: () => (space = false)
    },
    Box(
      {
        position: 'absolute',
        left: 0,
        top: 0,
        width: inputs.contentWidth,
        height: inputs.contentHeight,
        transform: worldTransform
      },
      inputs.content.value
    ),
    ...overlays
  );
}
