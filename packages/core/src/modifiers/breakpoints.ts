import { bandOf, type UiContainerSizeSource } from '../environment/UiContainerSize';
import { defineModifier } from './UiModifier';

export interface SizeContainerArgs {
  /**
   * The source this container feeds. The same object goes on the
   * node's `containerSize` property, which is what puts it in the
   * environment for the subtree.
   */
  readonly source: UiContainerSizeSource;
}

/**
 * Reports a node's content size to the source its subtree reads.
 *
 * The container-query half of `EXCELLENCE_ROADMAP.md` X7, and built on
 * `host.onLayout` for the same reason `scrollPosition` is: "this
 * node's box changed on this frame" already has exactly one mechanism,
 * and a second one carrying the same fact would be a second thing to
 * keep right.
 *
 * The size reported is the **content** box: the border box less
 * padding, because the room a child has is the room inside the
 * padding, and a layout that switched arms at 600 px would otherwise
 * switch at 600 px of border box and lay itself out in 560.
 *
 * `Responsive` attaches this for you. Attach it by hand when the
 * source has to be reachable somewhere the helper's own children are
 * not, and put the same object on the node's `containerSize` prop.
 */
export const sizeContainer = defineModifier<SizeContainerArgs>({
  name: 'sizeContainer',
  attach(host, args) {
    const report = (): void => {
      const box = host.layoutBox();
      if (box === null) {
        return;
      }
      const inset = (name: string, axis: string): number => {
        const side = host.get<number | undefined>(name);
        return typeof side === 'number' ? side : (host.get<number | undefined>(axis) ?? 0);
      };
      const horizontal = inset('paddingLeft', 'paddingX') + inset('paddingRight', 'paddingX');
      const vertical = inset('paddingTop', 'paddingY') + inset('paddingBottom', 'paddingY');
      args.source.report(Math.max(0, box.width - horizontal), Math.max(0, box.height - vertical));
    };
    host.onLayout(report);
    // The first layout may already have happened, for a node mounted
    // into a tree that is on screen; `onLayout` only reports changes.
    report();
  }
});

export interface BreakpointArgs {
  /**
   * Widths, in ascending order, at which the properties change. A band
   * runs from its own width up to the next one.
   */
  readonly at: readonly number[];
  /**
   * What to write in each band, keyed by the width that opens it. The
   * band below the first breakpoint is keyed `0`.
   *
   * Properties are written cumulatively from the narrowest band up, so
   * a band only names what it changes: `{ 0: { paddingX: 12 }, 900: {
   * paddingX: 32 } }` keeps everything else the narrow arm set.
   */
  readonly props: Readonly<Record<number, Readonly<Record<string, unknown>>>>;
}

/**
 * Changes a node's own properties as the room it has crosses a width.
 *
 * The small half of container queries, and the one to reach for first:
 * a screen whose gutter, column count or type size differs at 400 px
 * and 1400 px is a set of properties, not a different tree, and
 * changing properties costs a layout rather than a rebuild.
 * `Responsive` is for when the *children* genuinely differ.
 *
 * It measures the node it is attached to, which is the useful thing
 * about it and the thing a media query cannot do: a card in a sidebar
 * asks how wide the card is, not how wide the window is.
 *
 * Nothing is written until the node has been laid out once, so the
 * first frame uses the element's own values. Give the element the
 * narrowest band's values as its declared props if that matters.
 */
export const breakpoint = defineModifier<BreakpointArgs>({
  name: 'breakpoint',
  attach(host, args) {
    const bands = [0, ...args.at];
    let current = -1;
    const apply = (): void => {
      const box = host.layoutBox();
      if (box === null) {
        return;
      }
      const band = bandOf(box.width, args.at);
      if (band === current) {
        return;
      }
      current = band;
      // From the narrowest band up to this one, so a band that names
      // one property does not silently drop what the bands below set.
      const written = new Map<string, unknown>();
      for (const edge of bands) {
        if (edge > band) {
          break;
        }
        for (const [name, value] of Object.entries(args.props[edge] ?? {})) {
          written.set(name, value);
        }
      }
      for (const [name, value] of written) {
        host.set(name, value);
      }
    };
    host.onLayout(apply);
    apply();
  }
});
