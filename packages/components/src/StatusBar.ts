import { BehaviorSubject, combineLatest, isObservable, map, of, type Observable } from 'rxjs';

import { controlled, createComponent, FocusService, input, type ComponentContext, type Inputs } from 'gesso-framework';
import {
  resolveString,
  Row,
  Text,
  type UiChild,
  type UiColorValue,
  type UiElement,
  type UiKeyboardEvent,
  type UiModifier,
  type UiNode,
  type UiSemanticState
} from 'gesso-core';
import { glyph } from './glyph';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, layoutOf, modifiersOf, type ControlLayoutProps } from './internals';
import { Spinner } from './Media';
import type { NavigationIcon } from './NavigationRail';
import { useOverlay } from './overlay';
import { tooltipOn } from './Tooltip';

/** How an item's text is coloured: muted by default, as a status line's is. */
export type StatusBarTone = 'muted' | 'default' | 'primary' | 'danger';

/** One thing a status bar says: where the caret is, what is running, which encoding. */
export interface StatusBarItem {
  /** Unique among the items. */
  readonly key: string;
  /**
   * What it says. A cell for one that changes, such as the caret's line
   * and column: the bar draws the new text without being rebuilt, so the
   * items can be declared once.
   */
  readonly text: string | Observable<string>;
  /** Its name to a screen reader, where the text alone is terse: "Encoding, UTF-8" for `UTF-8`. Default the text. */
  readonly label?: string | Observable<string>;
  readonly icon?: NavigationIcon;
  /** Which end of the bar it sits at. Default `'start'`. */
  readonly side?: 'start' | 'end';
  readonly tone?: StatusBarTone | Observable<StatusBarTone>;
  /** Said when the pointer rests on it. */
  readonly tooltip?: string;
  /** Something is going on: a spinner before its text. */
  readonly busy?: boolean | Observable<boolean>;
  /** Its changes are announced, politely: "Saving…", "Saved". */
  readonly live?: boolean;
  /** Makes it a button that does this: open a picker, show the problems. */
  readonly onClick?: () => void;
}

/**
 * The line along the bottom of an application: where the caret is, what
 * is running, what the selection adds up to, and the zoom.
 *
 * Items sit at the start or the end, each a piece of text with an
 * optional icon, spinner, tone and tooltip. An item with `onClick` is a
 * button: the encoding that opens a picker, the error count that shows
 * the problems. An item's text can be a cell, so a caret position that
 * changes on every key is drawn without the bar being rebuilt.
 *
 * **Zoom.** Given `zoom` or `defaultZoom`, the bar ends with −, the zoom
 * as a percentage, and +; the percentage puts it back to 100%. The steps
 * are a browser's unless `zoomSteps` gives others.
 *
 * **One tab stop.** A status bar is the last thing on a screen and the
 * least often wanted, so its buttons are one stop between them and the
 * arrows walk them, as a toolbar's are. Text that only says something is
 * not a stop at all; one marked `live` is announced as it changes.
 */
export interface StatusBarProps extends ControlLayoutProps {
  items: readonly StatusBarItem[];
  /** The zoom, 1 for 100%. Given this or `defaultZoom`, the bar draws the zoom control. */
  zoom?: number;
  defaultZoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** The zooms − and + step through, in order. Default a browser's, 25% to 500%. */
  zoomSteps?: readonly number[];
  /** The bar's name. Default "Status bar". */
  label?: string;
}

const ZOOM_STEPS: readonly number[] = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

const TONES: Readonly<Record<StatusBarTone, UiColorValue>> = {
  muted: 'textMuted',
  default: 'text',
  primary: 'primary',
  danger: 'danger'
};

const cellOf = <T>(value: T | Observable<T>): Observable<T> => (isObservable(value) ? value : of(value));

/** The next zoom step past `zoom` in the direction of `delta`, or the end it is already at. */
export function zoomStep(zoom: number, delta: 1 | -1, steps: readonly number[] = ZOOM_STEPS): number {
  if (steps.length === 0) return zoom;
  if (delta > 0) return steps.find(step => step > zoom + 1e-6) ?? steps[steps.length - 1]!;
  return [...steps].reverse().find(step => step < zoom - 1e-6) ?? steps[0]!;
}

export function StatusBar(inputs: Inputs<StatusBarProps>, ctx: ComponentContext): UiChild {
  const label = input(inputs.label, 'Status bar');
  const focus = ctx.inject(FocusService);
  const showsZoom = inputs.zoom.value !== undefined || inputs.defaultZoom.value !== undefined;
  const zoom = controlled<number>({
    component: 'StatusBar',
    name: 'zoom',
    source: inputs.zoom,
    initial: inputs.defaultZoom,
    fallback: 1,
    onChange: inputs.onZoomChange
  });
  const steps = (): readonly number[] => inputs.zoomSteps.value ?? ZOOM_STEPS;

  /** The buttons' nodes, by key, in the order the arrows walk them. */
  const buttons = new Map<string, UiNode>();
  /** The button that is the bar's tab stop: the last one focused, else the first. */
  const stop = new BehaviorSubject<string | null>(null);
  let bar: UiNode | null = null;
  /** Each item's tooltip, made once per key so a rebuilt row keeps its modifier rather than taking a new one. */
  const tips = new Map<string, UiModifier>();
  /** One overlay entry for every item's tooltip, registered here while the body runs. */
  const tipOverlay = useOverlay(ctx, 'status-bar-tooltip');
  const tipFor = (key: string, text: () => string): UiModifier => {
    let tip = tips.get(key);
    if (tip === undefined) {
      tip = tooltipOn(tipOverlay, { text });
      tips.set(key, tip);
    }
    return tip;
  };

  /** The buttons in the order they are drawn: the start's, the end's, then the zoom's. */
  const order = (): string[] => {
    const items = inputs.items.value.filter(item => item.onClick !== undefined);
    const keys = [
      ...items.filter(item => item.side !== 'end').map(item => item.key),
      ...items.filter(item => item.side === 'end').map(item => item.key)
    ];
    return showsZoom ? [...keys, 'zoom-out', 'zoom-reset', 'zoom-in'] : keys;
  };
  const stopKey = combineLatest([stop, inputs.items]).pipe(
    map(([key]) => {
      const keys = order();
      return key !== null && keys.includes(key) ? key : (keys[0] ?? null);
    })
  );

  const walk = (event: UiKeyboardEvent, from: string): void => {
    const keys = order();
    const at = keys.indexOf(from);
    const rtl = bar !== null && resolveString(bar, 'textDirection') === 'rtl';
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? keys.length - 1
          : event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
            ? Math.min(keys.length - 1, at + 1)
            : event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
              ? Math.max(0, at - 1)
              : -1;
    if (next === -1) return;
    event.preventDefault();
    event.stopPropagation();
    const node = buttons.get(keys[next]!);
    if (node !== undefined) focus.focus(node);
  };

  /** A button of the bar's: a tab stop only while it is the bar's one, and pressed by Enter and Space as well. */
  const button = (
    key: string,
    name: string | Observable<string>,
    press: () => void,
    content: readonly UiChild[],
    extra: readonly UiModifier[] = []
  ): UiElement => {
    let mine: UiNode | null = null;
    return Row(
      {
        key,
        ref: (node: UiNode | null) => {
          if (node !== null) buttons.set(key, node);
          else if (buttons.get(key) === mine) buttons.delete(key);
          mine = node;
        },
        modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING, ...extra],
        focusable: true,
        tabStop: stopKey.pipe(map(current => current === key)),
        role: 'button',
        label: name,
        gap: 4,
        y: 'center',
        paddingX: 6,
        height: 20,
        borderRadius: 4,
        flexShrink: 0,
        onClick: press,
        onFocus: () => stop.next(key),
        onKeyDown: (event: UiKeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            press();
            return;
          }
          walk(event, key);
        }
      },
      ...content
    );
  };

  const itemElement = (item: StatusBarItem): UiElement => {
    const ink = cellOf(item.tone ?? 'muted').pipe(map(tone => TONES[tone]));
    const busy = cellOf(item.busy ?? false);
    const text = cellOf(item.text);
    const name = item.label ?? item.text;
    const content: UiChild[] = [
      busy.pipe(map(on => (on ? [createComponent(Spinner, { size: 12, color: 'textMuted', label: '' })] : []))),
      ...(item.icon === undefined ? [] : [glyph(item.icon, ink, 14)]),
      Text({
        text,
        color: ink,
        textStyle: 'bodySmall',
        textWrap: 'none',
        maxLines: 1,
        textOverflow: 'ellipsis',
        selectable: false,
        ...(item.live === true ? { live: 'polite' } : {})
      })
    ];
    const tips = item.tooltip === undefined ? [] : [tipFor(item.key, () => item.tooltip ?? '')];
    if (item.onClick !== undefined) {
      return button(item.key, name, () => item.onClick?.(), content, tips);
    }
    return Row(
      {
        key: item.key,
        gap: 4,
        y: 'center',
        paddingX: 6,
        height: 20,
        flexShrink: 0,
        minWidth: 0,
        modifiers: tips,
        // A piece of text with an icon or a spinner is read as one thing, by its name, and says when it is busy.
        ...(item.icon === undefined && item.busy === undefined
          ? {}
          : {
              role: 'group',
              label: name,
              states: busy.pipe(map(on => (on ? (['busy'] as UiSemanticState[]) : [])))
            })
      },
      ...content
    );
  };

  const side = (end: boolean): Observable<UiElement[]> =>
    inputs.items.pipe(map(items => items.filter(item => (item.side === 'end') === end).map(item => itemElement(item))));

  const percentText = zoom.value.pipe(map(value => `${Math.round(value * 100)}%`));
  const zoomControl: UiChild[] = !showsZoom
    ? []
    : [
        Row(
          { key: 'zoom', role: 'group', label: 'Zoom', gap: 0, y: 'center', flexShrink: 0 },
          button('zoom-out', 'Zoom out', () => zoom.change(zoomStep(zoom.current(), -1, steps())), [
            Text({ text: '−', color: 'textMuted', textStyle: 'bodySmall', selectable: false })
          ]),
          button('zoom-reset', percentText.pipe(map(text => `Zoom ${text}, reset to 100%`)), () => zoom.change(1), [
            Text({
              text: percentText,
              color: 'textMuted',
              textStyle: 'bodySmall',
              minWidth: 36,
              textAlign: 'center',
              selectable: false
            })
          ]),
          button('zoom-in', 'Zoom in', () => zoom.change(zoomStep(zoom.current(), 1, steps())), [
            Text({ text: '+', color: 'textMuted', textStyle: 'bodySmall', selectable: false })
          ])
        )
      ];

  return Row(
    {
      ...layoutOf(inputs),
      ref: (node: UiNode | null) => (bar = node),
      modifiers: modifiersOf(inputs),
      flexShrink: 0,
      minHeight: 24,
      paddingX: 6,
      gap: 4,
      y: 'center',
      backgroundColor: 'surface',
      role: 'toolbar',
      label
    },
    Row({ gap: 4, y: 'center', flexShrink: 1, minWidth: 0 }, side(false)),
    Row({ flexGrow: 1 }),
    Row({ gap: 4, y: 'center', flexShrink: 1, minWidth: 0 }, side(true)),
    ...zoomControl
  );
}
