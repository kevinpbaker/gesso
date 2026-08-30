import type { Observable } from 'rxjs';

import type { ComponentContext } from '../framework/FunctionComponent';
import { OverlayStore, type OverlayEntry, type OverlayPlacement } from '../framework/overlay/OverlayStore';
import type { UiChild } from '../ui/composition/UiElement';
import type { UiNode } from '../ui/graph/UiNode';

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
  readonly placement?: OverlayPlacement;
  readonly offset?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly dismissOnOutsidePress?: boolean;
  readonly zIndex?: number;
  /** A node whose theme and text style the content should keep. */
  readonly environment?: UiNode | null;
  readonly onClose?: () => void;
}

let counter = 0;

export function useOverlay(ctx: ComponentContext, name: string): OverlayHandle {
  const store = ctx.inject(OverlayStore);
  const id = `${name}-${counter++}`;
  ctx.onUnmount(() => store.close(id));
  return {
    id,
    open: store.select(state => state.entries.value.some(entry => entry.id === id)),
    isOpen: () => store.isOpen(id),
    show: (content, options = {}) => {
      const entry: OverlayEntry = { id, content, ...options };
      store.dispatch('open', entry);
    },
    hide: () => store.dispatch('close', id)
  };
}

export type { OverlayPlacement };
