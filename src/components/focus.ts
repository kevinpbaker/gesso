import { BehaviorSubject, combineLatest, map, type Observable } from 'rxjs';

import type { InputCell } from '../framework/Input';
import type { ComponentContext } from '../framework/FunctionComponent';
import { FocusService } from '../framework/app/FocusService';
import type { UiNode } from '../ui/graph/UiNode';
import type { UiNodeRef } from '../ui/composition/UiElementProps';

/**
 * A control's own focus, and a handle on its node.
 *
 * Focus lives in the runtime, so a control learns about its own by
 * comparing the focused node with the one its `ref` handed it. Until
 * B3 of `MODIFIERS_ROADMAP.md` draws a focus ring, this is how a
 * control shows focus at all: it binds `borderColor` to `focused`.
 *
 * `node()` is what a form hands to `FocusService.focus` to put the caret
 * in the field that failed validation — and a caller that needs the
 * node itself passes a `ref`, which is forwarded to the element that
 * *is* the control rather than to the component's outermost box.
 */
export interface ControlFocus {
  /** Put this on the element that *is* the control. */
  readonly ref: UiNodeRef;
  readonly focused: Observable<boolean>;
  node(): UiNode | null;
  /** Focuses the control, once it exists. */
  focus(): void;
}

export function trackFocus(ctx: ComponentContext, forwarded?: InputCell<UiNodeRef | undefined>): ControlFocus {
  const store = ctx.inject(FocusService);
  const self = new BehaviorSubject<UiNode | null>(null);
  return {
    ref: node => {
      self.next(node);
      forwarded?.value?.(node);
    },
    focused: combineLatest([store.focused, self]).pipe(map(([focused, node]) => node !== null && focused === node)),
    node: () => self.value,
    focus: () => {
      const node = self.value;
      if (node !== null) {
        store.focus(node);
      }
    }
  };
}
