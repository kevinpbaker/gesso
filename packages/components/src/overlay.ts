import { distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  type ComponentContext,
  OverlayService,
  type OverlayEntry,
  type OverlayPlacement,
  type OverlayRect
} from 'gesso-framework';
import type { Reactive, UiChild, UiNode } from 'gesso-core';

/**
 * One component's entry in the overlay layer.
 *
 * The store is the framework's; this is the per-instance handle around
 * it — a unique id, an `open` cell to bind, and a close that runs when
 * the component unmounts, so an overlay can never outlive the thing
 * that opened it.
 */
export interface OverlayHandle {
  readonly id: string;
  /** Whether this component's entry is open. */
  readonly open: Observable<boolean>;
  isOpen(): boolean;
  show(content: UiChild, options?: OverlayOptions): void;
  hide(): void;
}

export interface OverlayOptions {
  readonly anchor?: UiNode | null;
  /** The part of the anchor to open beside, such as a character in a field; see `OverlayEntry.anchorRect`. */
  readonly anchorRect?: Reactive<OverlayRect | undefined>;
  readonly placement?: OverlayPlacement;
  readonly offset?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
  /** A point to open beside, kept on screen; see `OverlayEntry.point`. */
  readonly point?: { readonly x: number; readonly y: number };
  /** Keep the entry in the middle of the viewport along an axis. */
  readonly center?: 'x' | 'y' | 'both';
  readonly dismissOnOutsidePress?: boolean;
  /** A backdrop that takes presses outside even when they don't close it; see `OverlayEntry.modal`. */
  readonly modal?: boolean;
  readonly zIndex?: number;
  /** A node whose theme and text style the content should keep. */
  readonly environment?: UiNode | null;
  readonly onClose?: () => void;
}

let counter = 0;

export function useOverlay(ctx: ComponentContext, name: string): OverlayHandle {
  const overlays = ctx.inject(OverlayService);
  const id = `${name}-${counter++}`;
  ctx.onUnmount(() => overlays.close(id));
  return {
    id,
    // Piped off the service's own cell. `select` existed so a store
    // could be read the same way whether it was local or remote; a
    // service is only ever local, so there is nothing to abstract over.
    open: overlays.entries.pipe(
      map(entries => entries.some(entry => entry.id === id)),
      distinctUntilChanged()
    ),
    isOpen: () => overlays.isOpen(id),
    show: (content, options = {}) => {
      const entry: OverlayEntry = { id, content, ...options };
      overlays.open(entry);
    },
    hide: () => overlays.close(id)
  };
}

export type { OverlayPlacement };
