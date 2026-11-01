import { map } from 'rxjs';

import { percent, provided, Stack, type UiChild, type UiNode } from 'gesso-core';

import { boundFocus } from '../app/FocusService';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import { OverlayLayer } from './OverlayLayer';
import { OverlayScopeKey, OverlayService } from './OverlayService';

export interface OverlayScopeProps {
  children?: UiChild;
}

/**
 * A part of the tree that holds its own overlays: a dialog, menu or
 * tooltip opened inside it is drawn inside it, over its content and
 * nowhere else.
 *
 * What a design tool's player needs from the screen it plays: a dialog
 * on that screen dims the screen, centres in it and is clipped by it,
 * is scaled with it when the screen is drawn smaller than its own size,
 * and leaves the tool around it pressable. A menu is placed and flipped
 * within it, since an anchored entry stays inside the box its layer
 * covers. Outside a scope, entries open in the runtime's own layer
 * above the whole application, as they always have.
 *
 * It fills what holds it, and is the containing block of what it
 * holds. `useOverlay` finds the nearest scope above the component that
 * opens the entry; with none, it uses the runtime's `OverlayService`.
 *
 * A dialog's trap inside it holds the keyboard inside it only: the
 * tool around it, and every other scope, keep their focus, and none is
 * taken from them when it opens or handed to them when it closes.
 */
export function OverlayScope(inputs: Inputs<OverlayScopeProps>, _ctx: ComponentContext): UiChild {
  const overlays = new OverlayService();
  return Stack(
    {
      position: 'relative',
      width: percent(100),
      height: percent(100),
      x: 'stretch',
      y: 'stretch',
      provide: [provided(OverlayScopeKey, overlays)],
      ref: (node: UiNode | null) => {
        if (node !== null) {
          boundFocus(node);
        }
      }
    },
    inputs.children.pipe(map(children => children ?? [])),
    createComponent(OverlayLayer, { service: overlays })
  );
}
