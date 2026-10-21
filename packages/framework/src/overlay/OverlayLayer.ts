import { map } from 'rxjs';

import {
  Box,
  defineModifier,
  fade,
  motion,
  UiEnvironmentKeys,
  type UiNode,
  type UiChild,
  type UiElement,
  type UiModifier
} from 'gesso-core';
import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { OverlayService, physicalPlacement, type OverlayEntry, type OverlayPhysicalPlacement } from './OverlayService';

/**
 * The layer every runtime mounts above the app root.
 *
 * An absolutely positioned box covering the viewport, above everything
 * (zIndex 1000) but not itself hit-testable, so with nothing open it
 * is invisible to input. Each open entry becomes an absolutely
 * positioned box the layout engine places — beside its anchor, by its
 * edge offsets, or centred in the viewport — and, when the entry asks
 * for it, a full-size
 * backdrop beneath it that takes every press and wheel outside the
 * entry, and closes the entry on them when it is dismissible. A modal
 * entry's backdrop is dimmed with the theme's `scrim` unless it asks
 * for none.
 * Entries without a backdrop stay open and follow their anchor when
 * the content underneath scrolls.
 *
 * Entries render in store order; a later entry is on top unless it
 * sets zIndex.
 *
 * `start` and `end`, in a placement or as edge offsets, are resolved to
 * physical edges here, in the reading direction of the node the entry
 * takes its environment from, and resolved again if that direction
 * changes while the entry is open. See `OverlayEntry.environment` for
 * why that node and not always the anchor.
 */
@Define('gesso-overlay-layer')
export class OverlayLayer extends Component {
  @Inject(OverlayService) overlays!: OverlayService;

  override render(): UiElement {
    return Box(
      { position: 'absolute', inset: 0, zIndex: 1000, hitTestable: false },
      // Bound straight to the service's cell: it is on this thread,
      // so there is nothing for a selector to abstract over.
      this.overlays.entries.pipe(map(entries => this.renderEntries(entries)))
    );
  }

  private renderEntries(entries: readonly OverlayEntry[]): UiElement[] {
    const elements: UiElement[] = [];
    for (const entry of entries) {
      const environment = entry.environment ?? entry.anchor ?? null;
      if (entry.dismissOnOutsidePress === true || entry.modal === true) {
        // A modal's backdrop is there whether or not it closes anything:
        // it is what keeps a press beside the dialog from reaching the
        // page under it. One that doesn't close takes the press and the
        // wheel and does nothing with them.
        const dismiss = entry.dismissOnOutsidePress === true;
        elements.push(
          Box(
            {
              key: `${entry.id}\0backdrop`,
              position: 'absolute',
              inset: 0,
              zIndex: entry.zIndex,
              // The theme the entry's content has, so the scrim is the
              // colour of the palette the dialog was opened in.
              ...inheritedFrom(environment),
              modifiers: followEnvironment(environment, null),
              ...(dismiss
                ? {
                    onPointerDown: () => this.overlays.close(entry.id),
                    // A wheel over the backdrop is the user scrolling away;
                    // the menu closes rather than swallowing the scroll.
                    onWheel: () => this.overlays.close(entry.id)
                  }
                : {})
            },
            ...((entry.scrim ?? entry.modal === true) ? [scrim()] : [])
          )
        );
      }
      elements.push(
        Box(
          {
            key: entry.id,
            position: 'absolute',
            anchor: entry.anchor ?? undefined,
            anchorPoint: entry.anchor == null ? entry.point : undefined,
            anchorRect: entry.anchor == null ? undefined : entry.anchorRect,
            anchorOffset: entry.offset,
            top: entry.top,
            bottom: entry.bottom,
            zIndex: entry.zIndex,
            ...centering(entry),
            ...physicalEdges(entry, readsRightToLeft(environment)),
            ...inheritedFrom(environment),
            modifiers: followEnvironment(environment, entry)
          },
          entry.content as UiChild
        )
      );
    }
    return elements;
  }
}

/**
 * The dim over the page, inside the backdrop rather than on it.
 *
 * A node at opacity 0 takes no presses, so a backdrop fading in would
 * let a press through to the page on the frame it opens. The fade is
 * this child's; the backdrop under it is solid to input from the start,
 * and the child takes none of its own. It comes in at the pace a
 * `Dialog` does, and under reduced motion it is simply there.
 */
function scrim(): UiElement {
  return Box({
    position: 'absolute',
    inset: 0,
    hitTestable: false,
    backgroundColor: 'scrim',
    modifiers: [motion({ initial: fade, duration: 'slow', easing: 'decelerate' })]
  });
}

/**
 * `center` as the layout engine takes it.
 *
 * Both edges of the axis are pinned, which stretches the entry's box
 * across the viewport, and a Box is a Stack — so `x`/`y` centre the
 * content inside that span. The edges default to 0 but an entry that
 * gave one keeps it, which is what centres a toast horizontally
 * without lifting it off the bottom. The horizontal edges are
 * `physicalEdges`', since an entry may give them as `start` and `end`.
 *
 * The stretched box is `hitTestable: false`, since it is now much
 * bigger than what it holds: a press in the space beside a centred
 * dialog is a press outside the dialog, and has to reach the backdrop
 * underneath. Children are still tested, so the content itself keeps
 * taking its own presses.
 */
function centering(entry: OverlayEntry): Record<string, unknown> {
  if (entry.center === undefined || (entry.anchor ?? null) !== null) {
    return {};
  }
  const x = entry.center === 'x' || entry.center === 'both';
  const y = entry.center === 'y' || entry.center === 'both';
  return {
    hitTestable: false,
    ...(x ? { x: 'center' } : {}),
    ...(y ? { top: entry.top ?? 0, bottom: entry.bottom ?? 0, y: 'center' } : {})
  };
}

/** Whether the scoped text style at a node reads right to left, as the entry's content will. */
function readsRightToLeft(node: UiNode | null): boolean {
  return node?.environment?.get(UiEnvironmentKeys.textStyle).textDirection === 'rtl';
}

/**
 * The entry's placement and horizontal edges, with `start` and `end`
 * turned into the physical ones the layout engine takes.
 *
 * A logical edge wins over the physical one it lands on, so an entry
 * that gives both says which it meant. A centred entry's edges are the
 * span it centres in, and default to the viewport's.
 */
function physicalEdges(
  entry: OverlayEntry,
  rtl: boolean
): { placement: OverlayPhysicalPlacement | undefined; left: number | undefined; right: number | undefined } {
  let left = (rtl ? entry.end : entry.start) ?? entry.left;
  let right = (rtl ? entry.start : entry.end) ?? entry.right;
  if ((entry.center === 'x' || entry.center === 'both') && (entry.anchor ?? null) === null) {
    left ??= 0;
    right ??= 0;
  }
  return {
    placement: entry.placement === undefined ? undefined : physicalPlacement(entry.placement, rtl),
    left,
    right
  };
}

/**
 * The scoped values an entry's content should keep, re-provided on the
 * box that holds it, as they are when the entry opens.
 */
function inheritedFrom(node: UiNode | null): Record<string, unknown> {
  const environment = node?.environment;
  if (environment === undefined || environment === null) {
    return {};
  }
  return {
    theme: environment.get(UiEnvironmentKeys.theme),
    textStyle: environment.get(UiEnvironmentKeys.textStyle),
    // As well as textStyle, which on its own would reset it to the
    // style's: a menu's plain text inherits the colour of where it was
    // declared.
    color: environment.get(UiEnvironmentKeys.color),
    contentColor: environment.get(UiEnvironmentKeys.contentColor)
  };
}

/** The node an entry's environment is read from, and the entry to place again when it changes (none for a backdrop). */
interface Followed {
  readonly from: UiNode;
  readonly entry: OverlayEntry | null;
}

/**
 * The same values again whenever they change where the entry was
 * declared, for as long as it is open.
 *
 * Reading them once let a dialog open while the page went dark (the
 * system's setting changed, or the theme a person chose arrived from
 * another worker a moment after they opened it) stay light over a dark
 * page until it was closed. The reading direction is one of them, and
 * the edges it decides are placed again with it.
 */
const followEnvironmentKind = defineModifier<Followed>({
  name: 'overlayEnvironment',
  attach(host, { from, entry }) {
    host.onEnvironment(() => {
      host.set('theme', host.environment(UiEnvironmentKeys.theme, from));
      const textStyle = host.environment(UiEnvironmentKeys.textStyle, from);
      host.set('textStyle', textStyle);
      host.set('color', host.environment(UiEnvironmentKeys.color, from));
      host.set('contentColor', host.environment(UiEnvironmentKeys.contentColor, from));
      // The direction comes with the text style, and an entry placed by
      // `start` or `end` is placed again by it: one opened before its
      // declaring tree was mounted read the default, left to right.
      if (entry !== null) {
        const edges = physicalEdges(entry, textStyle.textDirection === 'rtl');
        host.set('placement', edges.placement);
        host.set('left', edges.left);
        host.set('right', edges.right);
      }
    }, from);
  }
});

function followEnvironment(node: UiNode | null, entry: OverlayEntry | null): UiModifier<Followed>[] {
  return node === null ? [] : [followEnvironmentKind({ from: node, entry })];
}
