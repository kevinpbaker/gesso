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
import { OverlayService, type OverlayEntry } from './OverlayService';

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
      if (entry.dismissOnOutsidePress === true || entry.modal === true) {
        // A modal's backdrop is there whether or not it closes anything:
        // it is what keeps a press beside the dialog from reaching the
        // page under it. One that doesn't close takes the press and the
        // wheel and does nothing with them.
        const dismiss = entry.dismissOnOutsidePress === true;
        const environment = entry.environment ?? entry.anchor ?? null;
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
              modifiers: followEnvironment(environment),
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
            placement: entry.placement,
            anchorOffset: entry.offset,
            top: entry.top,
            right: entry.right,
            bottom: entry.bottom,
            left: entry.left,
            zIndex: entry.zIndex,
            ...centering(entry),
            ...inheritedFrom(entry.environment ?? entry.anchor ?? null),
            modifiers: followEnvironment(entry.environment ?? entry.anchor ?? null)
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
 * without lifting it off the bottom.
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
    ...(x ? { left: entry.left ?? 0, right: entry.right ?? 0, x: 'center' } : {}),
    ...(y ? { top: entry.top ?? 0, bottom: entry.bottom ?? 0, y: 'center' } : {})
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
    contentColor: environment.get(UiEnvironmentKeys.contentColor)
  };
}

/**
 * The same values again whenever they change where the entry was
 * declared, for as long as it is open.
 *
 * Reading them once let a dialog open while the page went dark (the
 * system's setting changed, or the theme a person chose arrived from
 * another worker a moment after they opened it) stay light over a dark
 * page until it was closed.
 */
const followEnvironmentKind = defineModifier<UiNode>({
  name: 'overlayEnvironment',
  attach(host, from) {
    host.onEnvironment(() => {
      host.set('theme', host.environment(UiEnvironmentKeys.theme, from));
      host.set('textStyle', host.environment(UiEnvironmentKeys.textStyle, from));
      host.set('contentColor', host.environment(UiEnvironmentKeys.contentColor, from));
    }, from);
  }
});

function followEnvironment(node: UiNode | null): UiModifier<UiNode>[] {
  return node === null ? [] : [followEnvironmentKind(node)];
}
