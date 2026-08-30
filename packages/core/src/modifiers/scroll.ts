import { defineModifier } from './UiModifier';

/** How far a scroll container has been scrolled, in logical pixels. */
export interface ScrollOffset {
  readonly x: number;
  readonly y: number;
}

export interface ScrollPositionArgs {
  /**
   * Told whenever this container's scroll offset changes, and only
   * then — not on every frame, and not when the container merely moved.
   */
  readonly onChange: (offset: ScrollOffset) => void;
}

/**
 * Reports a scroll container's offset whenever it changes.
 *
 * The counterpart of `measure`, and the answer to "how does an
 * application find out where a list is scrolled to". It exists because
 * nothing else could tell you: a wheel writes the container's offset
 * from inside the runtime, and so does a scrollbar drag, a trackpad
 * pan, and the `scrollIntoView` that keeps a focused row on screen.
 *
 * **Why this is not a scroll event.** Two reasons, and the second is
 * the one that decided it.
 *
 * An event would come from the input stack, and only some of the causes
 * above are input — a list scrolled because focus moved into a row
 * below the fold has scrolled just as much, and an `onScroll` that
 * stayed quiet for it would be a trap. To fire for all of them the
 * event would have to come from the layout phase, at which point it is
 * not an input event at all.
 *
 * And Gesso already has exactly one mechanism for "this node's layout
 * changed on this frame" — `LayoutNotifier`, reached through
 * `host.onLayout` — which this is built on. A second mechanism carrying
 * the same fact is the mistake `animateLayout` records not making when
 * it read `LayoutNotifier` rather than inventing a way to keep previous
 * boxes.
 *
 * **Restoring an offset is not this modifier's job**, and that
 * asymmetry is deliberate. `scrollY` is an ordinary property, so it is
 * put back the ordinary way — bind it, `<scrollview scrollY={cell}>`,
 * and a container built again after a route change is laid out where it
 * was left, before it paints. A modifier could not do it anyway: a
 * modifier writes through the override cascade, the runtime's own
 * scrolling writes the element's declared value, and an override would
 * shadow every wheel for the life of the node.
 *
 *   const at = internalState(0);
 *   <scrollview scrollY={at} modifiers={[scrollPosition({ onChange: o => (at.value = o.y) })]}>
 *
 * The offset reported is the container's **effective** one, taken from
 * the layout record: a wheel writes the property unclamped and the
 * engine clamps it to the content on the next layout, so the property
 * can name a place the list never actually went.
 */
export const scrollPosition = defineModifier<ScrollPositionArgs>({
  name: 'scrollPosition',
  attach(host, args) {
    let last: ScrollOffset | null = null;
    host.onLayout(() => {
      const offset = host.scrollOffset();
      if (offset === null || (last !== null && last.x === offset.x && last.y === offset.y)) {
        return;
      }
      last = offset;
      args.onChange(offset);
    });
  }
});
