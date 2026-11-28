import { BehaviorSubject, combineLatest, distinctUntilChanged, map, type Observable } from 'rxjs';

import type { ComponentContext, Inputs } from 'gesso-framework';
import {
  Box,
  Column,
  measure,
  percent,
  Row,
  type LayoutBox,
  type UiChild,
  type UiElement,
  type UiKeyboardEvent,
  type UiPointerEvent,
  type UiSemanticState
} from 'gesso-core';
import { controlled } from './controlled';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { wordsFor } from './messages';

/** One region of a `PanelGroup`: a sidebar, the editor, a bottom panel. */
export interface PanelGroupPanel {
  /** Unique among the panels: what `sizes` and `collapsed` are keyed by. */
  readonly key: string;
  readonly content: UiChild;
  /** The panel's name, which names the divider that resizes it: "Resize Explorer". Default its key. */
  readonly label?: string;
  /**
   * Its size in pixels before anyone moves it, and what a double click on
   * its divider puts back. Default 240. Ignored on the panel that fills.
   */
  readonly defaultSize?: number;
  /** The least it can be resized to, in pixels. Default 80. On the panel that fills, the least it is given. */
  readonly minSize?: number;
  /** The most it can be resized to, in pixels. Default no limit. */
  readonly maxSize?: number;
  /**
   * It can be collapsed to nothing: by dragging its divider past half its
   * least size, by Enter on the divider, or by the application through
   * `collapsed`. Its size is kept for when it comes back.
   */
  readonly collapsible?: boolean;
  /**
   * It takes what the others leave, and the window's changes with it, as
   * an editor's text does between its sidebar and its panel. One panel
   * fills: the first marked so, else the first without a `defaultSize`,
   * else the last.
   */
  readonly fill?: boolean;
}

/**
 * Panels side by side, or one above another, with a divider between
 * each two that the person moves: an editor's sidebar, text and second
 * sidebar, or its text above its terminal.
 *
 * `SplitPane` is two panes and a fraction. This is any number of them,
 * sized the way an application's are: every panel but one has a size in
 * pixels, which a window made wider or narrower leaves alone, and the
 * one that fills takes the rest. A divider resizes the panel beside it
 * that has a size; between two that both do, it trades one for the
 * other.
 *
 * **Collapsing.** A `collapsible` panel dragged past half its least
 * size folds away to nothing, and dragged back out returns. Enter on its
 * divider does the same, and `collapsed` lets the application do it from
 * a command ("Toggle sidebar"). A collapsed panel keeps its content
 * mounted and its size, so it comes back as it was.
 *
 * **Keeping the sizes.** `sizes` and `collapsed` are keyed by panel, so
 * an application that saves them (to `PersistedState`, say) gets them
 * back however its panels have changed since.
 *
 * **Operable from the keyboard.** Each divider is a `separator` that
 * takes focus: the arrows move it ten pixels (fifty with Shift), Home
 * and End take its panel to its least and most, and Enter collapses and
 * restores it. Its value is the panel's size.
 *
 * The panels are read once, when the group mounts: to hide one and show
 * it again, collapse it.
 */
export interface PanelGroupProps extends ControlLayoutProps {
  panels: readonly PanelGroupPanel[];
  /** Side by side (`'row'`, the default) or one above another (`'column'`). Read once. */
  direction?: 'row' | 'column';
  /** Each sized panel's size in pixels, by key. A panel missing from it has its `defaultSize`. */
  sizes?: Readonly<Record<string, number>>;
  defaultSizes?: Readonly<Record<string, number>>;
  onSizesChange?: (sizes: Readonly<Record<string, number>>) => void;
  /** The collapsed panels, by key. */
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: readonly string[]) => void;
  /**
   * How the dividers are drawn: `'line'`, the default, a one-pixel rule
   * in the middle of a grab area, for panels that meet edge to edge as an
   * editor's do; `'bar'` a framed handle, as `SplitPane`'s is. Read once.
   */
  divider?: 'line' | 'bar';
}

const DEFAULT_SIZE = 240;
const DEFAULT_MIN = 80;
/** How wide a divider is to the pointer, in pixels. */
const DIVIDER = 6;
const STEP = 10;
const BIG_STEP = 50;

const NO_SIZES: Readonly<Record<string, number>> = {};
const NONE: readonly string[] = [];

/** Which panel fills: the first marked, else the first without a size, else the last. */
function fillIndex(panels: readonly PanelGroupPanel[]): number {
  const marked = panels.findIndex(panel => panel.fill === true);
  if (marked !== -1) return marked;
  const unsized = panels.findIndex(panel => panel.defaultSize === undefined);
  return unsized !== -1 ? unsized : panels.length - 1;
}

export function PanelGroup(inputs: Inputs<PanelGroupProps>, ctx: ComponentContext): UiChild {
  const say = wordsFor(ctx);
  const panels = inputs.panels.value;
  const horizontal = (inputs.direction?.value ?? 'row') === 'row';
  const line = inputs.divider?.value !== 'bar';
  const fill = fillIndex(panels);
  const track = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });

  const sizes = controlled<Readonly<Record<string, number>>>({
    component: 'PanelGroup',
    name: 'sizes',
    source: inputs.sizes,
    initial: inputs.defaultSizes,
    fallback: NO_SIZES,
    onChange: inputs.onSizesChange
  });
  const collapsed = controlled<readonly string[]>({
    component: 'PanelGroup',
    name: 'collapsed',
    source: inputs.collapsed,
    initial: inputs.defaultCollapsed,
    fallback: NONE,
    onChange: inputs.onCollapsedChange
  });

  const minOf = (panel: PanelGroupPanel): number => panel.minSize ?? DEFAULT_MIN;
  const maxOf = (panel: PanelGroupPanel): number => panel.maxSize ?? Infinity;
  const sizeIn = (all: Readonly<Record<string, number>>, panel: PanelGroupPanel): number =>
    all[panel.key] ?? panel.defaultSize ?? DEFAULT_SIZE;
  const isCollapsed = (panel: PanelGroupPanel): boolean => collapsed.current().includes(panel.key);
  /** What a sized panel takes up now: nothing while it is collapsed. */
  const shownSize = (panel: PanelGroupPanel): number => (isCollapsed(panel) ? 0 : sizeIn(sizes.current(), panel));

  /**
   * The most a sized panel can be given: its own limit, and what the
   * group can spare without squeezing the panel that fills below its
   * least size.
   */
  const room = (target: PanelGroupPanel, partner?: PanelGroupPanel): number => {
    const box = track.value;
    const extent = horizontal ? box.width : box.height;
    if (extent <= 0) return maxOf(target);
    const others = panels.reduce(
      (sum, panel, index) => (index === fill || panel === target || panel === partner ? sum : sum + shownSize(panel)),
      0
    );
    const spare = extent - others - DIVIDER * (panels.length - 1) - minOf(panels[fill]!);
    return Math.min(maxOf(target), Math.max(minOf(target), spare));
  };

  const setSize = (panel: PanelGroupPanel, size: number): void => {
    const current = sizes.current();
    if (current[panel.key] === size) return;
    sizes.change({ ...current, [panel.key]: size });
  };
  const setCollapsed = (panel: PanelGroupPanel, fold: boolean): void => {
    const current = collapsed.current();
    if (current.includes(panel.key) === fold) return;
    collapsed.change(fold ? [...current, panel.key] : current.filter(key => key !== panel.key));
  };

  /**
   * What a divider resizes. Between a panel and the one that fills, the
   * other one, which grows toward the fill; between two sized panels,
   * both, the one before growing as the one after shrinks.
   */
  interface Resize {
    readonly target: PanelGroupPanel;
    /** +1 when the target is before the divider, so moving the divider forward grows it. */
    readonly sign: 1 | -1;
    /** The panel on the divider's other side that gives what the target takes, unless it fills. */
    readonly partner?: PanelGroupPanel;
  }
  const resizeAt = (index: number): Resize => {
    const before = panels[index]!;
    const after = panels[index + 1]!;
    if (index === fill) return { target: after, sign: -1 };
    if (index + 1 === fill) return { target: before, sign: 1 };
    return { target: before, sign: 1, partner: after };
  };

  /** Where the divider was taken hold of, and the sizes then. */
  let grab: { readonly at: number; readonly size: number; readonly total?: number } | null = null;

  /**
   * The target given `wanted` pixels: clamped to what it and its partner
   * allow, collapsed past half its least size when it can be, and opened
   * again when it is dragged back out.
   */
  const apply = ({ target, partner }: Resize, wanted: number, total?: number): void => {
    if (target.collapsible === true && wanted < minOf(target) / 2) {
      // Folded by a drag, it keeps the size it had when the drag began, not
      // the least size the drag passed through on the way: it comes back as
      // it was.
      if (grab !== null) setSize(target, grab.size);
      setCollapsed(target, true);
      return;
    }
    let size = Math.min(room(target, partner), Math.max(minOf(target), wanted));
    if (partner !== undefined && total !== undefined) {
      const rest = Math.min(maxOf(partner), Math.max(minOf(partner), total - size));
      size = total - rest;
      setSize(partner, rest);
    }
    setSize(target, Math.round(size));
    setCollapsed(target, false);
  };

  const along = (event: UiPointerEvent): number => (horizontal ? event.x : event.y);
  const startDrag = (resize: Resize, event: UiPointerEvent): void => {
    event.stopPropagation();
    const size = shownSize(resize.target);
    grab = {
      at: along(event),
      size,
      ...(resize.partner === undefined ? {} : { total: size + shownSize(resize.partner) })
    };
  };
  const drag = (resize: Resize, event: UiPointerEvent): void => {
    event.stopPropagation();
    if (grab === null) startDrag(resize, event);
    const start = grab!;
    apply(resize, start.size + (along(event) - start.at) * resize.sign, start.total);
  };

  const nudge = (resize: Resize, by: number): void => {
    const size = isCollapsed(resize.target) ? 0 : shownSize(resize.target);
    const total = resize.partner === undefined ? undefined : size + shownSize(resize.partner);
    // From collapsed, a nudge opens it at its least size rather than at a few pixels.
    apply(resize, isCollapsed(resize.target) && by > 0 ? minOf(resize.target) : size + by, total);
  };

  const divider = (index: number): UiElement => {
    const resize = resizeAt(index);
    const { target } = resize;
    const name = target.label ?? target.key;
    const folded = collapsed.value.pipe(map(list => list.includes(target.key)));
    const value: Observable<number> = combineLatest([sizes.value, folded]).pipe(
      map(([all, fold]) => (fold ? 0 : sizeIn(all, target)))
    );
    const forward = horizontal ? 'ArrowRight' : 'ArrowDown';
    const backward = horizontal ? 'ArrowLeft' : 'ArrowUp';
    return Box(
      {
        key: `divider ${target.key}`,
        focusable: true,
        modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
        ...(horizontal ? { width: DIVIDER, height: percent(100) } : { height: DIVIDER, width: percent(100) }),
        flexShrink: 0,
        backgroundColor: line ? 'transparent' : 'controlBackground',
        borderColor: 'controlBorder',
        borderWidth: line ? 0 : 1,
        x: 'center',
        y: 'center',
        cursor: horizontal ? 'col-resize' : 'row-resize',
        role: 'separator',
        label: say('gesso.panelGroup.resize', { panel: name }),
        valueNow: value,
        valueMin: target.collapsible === true ? 0 : minOf(target),
        ...(target.maxSize === undefined ? {} : { valueMax: target.maxSize }),
        ...(target.collapsible === true
          ? { states: folded.pipe(map(fold => [fold ? 'collapsed' : 'expanded'] as UiSemanticState[])) }
          : {}),
        // Pan from the first pixel, and a Drag for a divider held still before it moves; see `SplitPane`.
        onPanStart: (event: UiPointerEvent) => startDrag(resize, event),
        onPanMove: (event: UiPointerEvent) => drag(resize, event),
        onPanEnd: () => (grab = null),
        onDragStart: (event: UiPointerEvent) => startDrag(resize, event),
        onDragMove: (event: UiPointerEvent) => drag(resize, event),
        onDragEnd: () => (grab = null),
        // A double click puts the panel back to where it started, open.
        onDoubleClick: () => {
          setSize(target, target.defaultSize ?? DEFAULT_SIZE);
          setCollapsed(target, false);
        },
        onKeyDown: (event: UiKeyboardEvent) => {
          const step = event.modifiers.shift ? BIG_STEP : STEP;
          const by = (event.key === forward ? step : event.key === backward ? -step : 0) * resize.sign;
          if (by !== 0) {
            nudge(resize, by);
          } else if (event.key === 'Home') {
            if (target.collapsible === true) setCollapsed(target, true);
            else apply(resize, minOf(target), totalOf(resize));
          } else if (event.key === 'End') {
            apply(resize, room(target, resize.partner), totalOf(resize));
          } else if (event.key === 'Enter' && target.collapsible === true) {
            setCollapsed(target, !isCollapsed(target));
          } else {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        }
      },
      ...(line
        ? [
            Box({
              width: horizontal ? 1 : percent(100),
              height: horizontal ? percent(100) : 1,
              backgroundColor: 'border'
            })
          ]
        : [])
    );
  };
  const totalOf = (resize: Resize): number | undefined =>
    resize.partner === undefined ? undefined : shownSize(resize.target) + shownSize(resize.partner);

  // Every panel clips and opts out of the automatic minimum: its size is
  // decided here, never by its content. See `SplitPane`.
  const shrinkable = { minWidth: 0, minHeight: 0, overflow: 'hidden' } as const;
  const panelElement = (panel: PanelGroupPanel, index: number): UiElement => {
    if (index === fill) {
      const least = minOf(panel);
      return Box(
        {
          key: panel.key,
          flexGrow: 1,
          flexBasis: 0,
          ...shrinkable,
          ...(horizontal ? { minWidth: least, height: percent(100) } : { minHeight: least, width: percent(100) })
        },
        panel.content
      );
    }
    const folded = collapsed.value.pipe(map(list => list.includes(panel.key)));
    const size = combineLatest([sizes.value, folded]).pipe(
      map(([all, fold]) => (fold ? 0 : sizeIn(all, panel))),
      distinctUntilChanged()
    );
    return Box(
      {
        key: panel.key,
        // A size, given way only when the window is too small for every
        // panel's: then the sized ones shrink too, down to their least.
        flexShrink: 1,
        ...shrinkable,
        ...(horizontal
          ? { width: size, minWidth: folded.pipe(map(fold => (fold ? 0 : minOf(panel)))), height: percent(100) }
          : { height: size, minHeight: folded.pipe(map(fold => (fold ? 0 : minOf(panel)))), width: percent(100) }),
        // Hidden while collapsed rather than taken away: no drawing, no
        // presses, no focus and nothing read, with what is inside kept.
        visible: folded.pipe(map(fold => !fold))
      },
      panel.content
    );
  };

  const children: UiElement[] = [];
  panels.forEach((panel, index) => {
    if (index > 0) children.push(divider(index - 1));
    children.push(panelElement(panel, index));
  });

  const container = {
    ...layoutOf(inputs),
    modifiers: modifiersOf(inputs, measure(track)),
    width: percent(100),
    height: percent(100)
  };
  return horizontal ? Row(container, ...children) : Column(container, ...children);
}
