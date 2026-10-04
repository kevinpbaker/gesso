import { BehaviorSubject, combineLatest, map } from 'rxjs';

import { input, type ComponentContext, type Inputs } from 'gesso-framework';
import { Box, Column, Row, type UiChild, type UiPointerEvent, type LayoutBox, percent, measure } from 'gesso-core';
import { controlled } from './controlled';
import { trackFocus } from './focus';
import {
  CONTROL_FOCUS_RING,
  CONTROL_INTERACTION,
  keymap,
  layoutOf,
  type ControlLayoutProps,
  modifiersOf
} from './internals';

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
  /**
   * Which panes are on screen: both, with the divider between them, or
   * only one, which takes the whole of the container. The other stays
   * mounted, hidden and out of the way, so what is in it (a scroll
   * position, a draft, an open dialog it declared) is still there when
   * it comes back. Default `'both'`.
   */
  show?: 'both' | 'first' | 'second';
}

export function SplitPane(inputs: Inputs<SplitPaneProps>, ctx: ComponentContext): UiChild {
  const direction = input(inputs.direction, 'row');
  const min = input(inputs.min, 0.1);
  const max = input(inputs.max, 0.9);
  const label = input(inputs.label, 'Resize panes');
  const show = input(inputs.show, 'both');
  const focus = trackFocus(ctx);
  const track = new BehaviorSubject<LayoutBox>({ x: 0, y: 0, width: 0, height: 0 });
  const split = controlled<number>({
    component: 'SplitPane',
    name: 'split',
    source: inputs.split,
    initial: inputs.defaultSplit,
    fallback: 0.5,
    onChange: inputs.onSplitChange
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

  // A pane on its own is the whole container, and a hidden one is
  // nothing; the divider goes with either.
  const firstSize = combineLatest([split.value, show]).pipe(
    map(([fraction, shown]) => percent(shown === 'first' ? 100 : shown === 'second' ? 0 : fraction * 100))
  );
  const both = show.pipe(map(shown => shown === 'both'));
  const dividerSize = both.pipe(map(shown => (shown ? 6 : 0)));
  const divider = Box({
    ref: focus.ref,
    focusable: true,
    modifiers: [CONTROL_INTERACTION, CONTROL_FOCUS_RING],
    width: horizontal() ? dividerSize : undefined,
    height: horizontal() ? undefined : dividerSize,
    visible: both,
    // A divider is a fixed size. Left shrinkable, it gave up a sliver of
    // its six pixels whenever the second pane's content was wider than
    // the track, a different sliver for every content width, so every
    // keystroke in a pane moved the pane by a fraction of a pixel and
    // re-measured everything in it.
    flexShrink: 0,
    backgroundColor: 'controlBackground',
    borderColor: 'controlBorder',
    borderWidth: both.pipe(map(shown => (shown ? 1 : 0))),
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
    ...layoutOf(inputs),
    // The track measures itself, so the divider knows what a pointer
    // position means without anything reaching into the engine.
    modifiers: modifiersOf(inputs, measure(track)),
    width: percent(100),
    height: percent(100)
  };
  // Both panes opt out of the automatic minimum, and the first one out
  // of shrinking as well.
  //
  // A flex item's automatic minimum is its content's min-content size,
  // so a pane whose text is wider than the fraction it was given
  // refuses to shrink and takes the space out of the other one. The
  // divider then stops dead partway across — the split still reports
  // the number it was asked for, and the panes ignore it. Both panes
  // clip, so their content was never what should decide their size:
  // the fraction is.
  const shrinkable = { minWidth: 0, minHeight: 0, overflow: 'hidden' } as const;
  const first = Box(
    {
      width: horizontal() ? firstSize : percent(100),
      height: horizontal() ? percent(100) : firstSize,
      // The fraction is a size, not an opening bid.
      flexShrink: 0,
      // Hidden rather than taken out of the tree: hidden is no drawing,
      // no presses, no focus and nothing for a screen reader, and the
      // state inside is kept.
      visible: show.pipe(map(shown => shown !== 'second')),
      ...shrinkable
    },
    inputs.first.value ?? Row()
  );
  // The second pane is whatever the first and the divider leave, so its
  // basis is zero rather than its content: with an automatic basis the
  // row measured everything in it at max-content first, on every pass,
  // to arrive at a size that never depended on that content.
  const second = Box(
    { flexGrow: 1, flexBasis: 0, visible: show.pipe(map(shown => shown !== 'first')), ...shrinkable },
    inputs.second.value ?? Row()
  );

  return horizontal() ? Row(container, first, divider, second) : Column(container, first, divider, second);
}
