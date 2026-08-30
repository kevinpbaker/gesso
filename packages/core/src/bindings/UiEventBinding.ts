import type { UiNode } from '../graph/UiNode';
import type { UiEventListener, UiInputDispatcher } from '../input/UiInputDispatcher';
import type { UiEventType } from '../input/UiInputEvent';

/**
 * Binds a declarative `on*` prop to a listener on the input dispatcher.
 *
 * Event bindings sit alongside UiBinding (observable properties) and
 * UiChildrenBinding (observable children) so that all three are torn
 * down by the same subtree-removal path. A handler can therefore never
 * outlive the node it was declared on.
 */
export class UiEventBinding {
  constructor(
    public readonly node: UiNode,
    public readonly type: UiEventType,
    public readonly listener: UiEventListener,
    private readonly dispatcher: UiInputDispatcher
  ) {}

  connect(): void {
    this.dispatcher.addEventListener(this.node, this.type, this.listener);
  }

  disconnect(): void {
    this.dispatcher.removeEventListener(this.node, this.type, this.listener);
  }
}
