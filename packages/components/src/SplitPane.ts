import { BehaviorSubject, map } from 'rxjs';

import { input, type ComponentContext, type Inputs } from '@gesso/framework';
import { Box, Column, Row, type UiChild, type UiPointerEvent, type LayoutBox, percent, measure } from '@gesso/core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import { CONTROL_FOCUS_RING, CONTROL_INTERACTION, keymap, layoutOf, type ControlLayoutProps } from './internals';

/**
 * Two panes and a divider the user can move.
 *
 * The divider follows the pointer because B2 gave a modifier the box
 * of its own node: `measure` reports the track's box, and a pointer
 * position inside it is a fraction. Before that this component could
 * only have been resized from the keyboard.
 *
 * It is also resizable from the keyboard — the divider is a `separator`
 * that takes focus and answers to the arrows — because a split a mouse
 * can move and a keyboard cannot is a split half the people cannot
 * move.
 */
export interface SplitPaneProps extends ControlLayoutProps {
  /** Where the divider sits, 0…1 of the container. */
  split?: number;
  defaultSplit?: number;
  onSplitChange?: (split: number) => void;
  first?: UiChild;
  second?: UiChild;
  direction?: 'row' | 'column';
  /** Fractions the divider will not go past. */
  min?: number;
  max?: number;
  label?: string;
}

export function SplitPane(props: Inputs<SplitPaneProps>, ctx: ComponentContext): UiChild {
  const direction = input(props.direction, 'row');
  const min = input(props.min, 0.1);
  const max = input(props.max, 0.9);
  const label = input(props.label, 'Resize panes');
  const focus = trackFocus(ctx);
  const track = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const split = controlled<number>({
    component: 'SplitPane',
    name: 'split',
    source: props.split,
    initial: props.defaultSplit,
    fallback: 0.5,
    onChange: props.onSplitChange
  });

  const horizontal = (): boolean => direction.value === 'row';
  const clamp = (value: number): number => Math.min(max.value, Math.max(min.value, value));
  const move = (by: number): void => split.change(clamp(split.current() + by));

  /** A pointer inside the track is a fraction of it. */
  const toFraction = (event: UiPointerEvent): number => {
    const box = track.value;
    const extent = horizontal() ? box.width : box.height;
    if (extent <= 0) {
      return split.current();
    }
    const along = horizontal() ? event.x - box.x : event.y - box.y;
    return clamp(along / extent);
  };

  const firstSize = split.value.pipe(map(fraction => percent(fraction * 100)));
  const divider = Box({
    ref: focus.ref,
    focusable: true,
    modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
    width: horizontal() ? 6 : undefined,
    height: horizontal() ? undefined : 6,
    backgroundColor: 'controlBackground',
    borderColor: 'controlBorder',
    borderWidth: 1,
    cursor: horizontal() ? 'col-resize' : 'row-resize',
    role: 'separator',
    label,
    valueNow: split.value.pipe(map(fraction => Math.round(fraction * 100))),
    valueMin: min.pipe(map(fraction => Math.round(fraction * 100))),
    valueMax: max.pipe(map(fraction => Math.round(fraction * 100))),
    // Pan, not Drag: in this input model a drag is a long press
    // followed by a move, and a divider has to follow the pointer from
    // the first pixel. Stopping propagation keeps a scroll container
    // above from panning at the same time.
    onPanMove: (event: UiPointerEvent) => {
      event.stopPropagation();
      split.change(toFraction(event));
    },
    onPanStart: (event: UiPointerEvent) => event.stopPropagation(),
    onKeyDown: keymap({
      ArrowLeft: () => move(horizontal() ? -0.02 : 0),
      ArrowRight: () => move(horizontal() ? 0.02 : 0),
      ArrowUp: () => move(horizontal() ? 0 : -0.02),
      ArrowDown: () => move(horizontal() ? 0 : 0.02),
      Home: () => split.change(min.value),
      End: () => split.change(max.value)
    })
  });

  const container = {
    ...layoutOf(props),
    // The track measures itself, so the divider knows what a pointer
    // position means without anything reaching into the engine.
    modifiers: [measure(track)],
    width: percent(100),
    height: percent(100)
  };
  const first = Box(
    {
      width: horizontal() ? firstSize : percent(100),
      height: horizontal() ? percent(100) : firstSize,
      overflow: 'hidden'
    },
    props.first.value ?? Row()
  );
  const second = Box({ flexGrow: 1, overflow: 'hidden' }, props.second.value ?? Row());

  return horizontal() ? Row(container, first, divider, second) : Column(container, first, divider, second);
}
