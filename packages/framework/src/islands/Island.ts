import {
  Box,
  type BoxProps,
  type UiChild,
  type UiModifier,
  type UiNode,
  type UiNodeRef,
  type UiRole
} from 'gesso-core';
import { map, type Observable } from 'rxjs';

import { FocusService } from '../app/FocusService';
import type { ComponentContext, Inputs } from '../FunctionComponent';
import type { InputCell } from '../Input';
import type { IslandToken } from './islandToken';
import type { IslandStandIn } from './IslandProtocol';
import { IslandService, type IslandHandle } from './IslandService';

/**
 * A handle on one island, for what props cannot say: a message for the
 * element ("fly to this place"), or the focus.
 *
 *   const map = islandController();
 *   <Island of={StoreMap} controller={map} … />
 *   map.post({ flyTo: store.id });
 *
 * A message posted before the island exists waits for it.
 */
export class IslandController {
  private handle: IslandHandle | null = null;
  private focusNode: (() => void) | null = null;
  private readonly queued: unknown[] = [];

  /** Sends a message to the element's `receive`, on the next frame. */
  post(message: unknown): void {
    if (this.handle === null) {
      this.queued.push(message);
      return;
    }
    this.handle.post(message);
  }

  /** Moves the runtime's focus to the island, and DOM focus to its element after it. */
  focus(): void {
    this.focusNode?.();
  }

  /** @internal Bound by the `Island` it is given to. */
  bind(handle: IslandHandle | null, focus: (() => void) | null): void {
    this.handle = handle;
    this.focusNode = focus;
    if (handle !== null) {
      for (const message of this.queued.splice(0)) {
        handle.post(message);
      }
    }
  }
}

/** Makes an `IslandController`. */
export function islandController(): IslandController {
  return new IslandController();
}

/**
 * The box props an `Island` passes to its box: where it goes, and how
 * the canvas draws its frame (a field's background, border and focus
 * ring are drawn here, around the element).
 */
export type IslandBoxProps = Pick<
  BoxProps,
  | 'width'
  | 'height'
  | 'minWidth'
  | 'minHeight'
  | 'maxWidth'
  | 'maxHeight'
  | 'flex'
  | 'flexGrow'
  | 'flexShrink'
  | 'margin'
  | 'selfX'
  | 'selfY'
  | 'padding'
  | 'x'
  | 'y'
  | 'overflow'
  | 'backgroundColor'
  | 'borderWidth'
  | 'borderColor'
  | 'borderRadius'
  | 'description'
  | 'states'
  | 'disabled'
>;

export interface IslandProps<P, E> extends IslandBoxProps {
  /** The kind, whose factory the shell registered with `provideIsland`. */
  of: IslandToken<P, E>;
  /** What the element is made with, and given again whenever it changes. Plain data. */
  props: P;
  /** What the element emitted, a frame after it did. */
  onEvent?: (event: E) => void;
  /** The island's form was submitted from the page: Enter in one of its fields. */
  onSubmit?: () => void;
  /** When the canvas draws `children` in place of the element; see `IslandStandIn`. `never` by default. */
  standIn?: IslandStandIn;
  /** Whether Tab stops on it (default true). Its element takes DOM focus when it does. */
  focusable?: boolean;
  /** The name an assistive technology reads; the element should carry it too. */
  label?: string;
  role?: UiRole;
  controller?: IslandController;
  /** Modifiers for the island's box: a focus ring, a theme's tokens. */
  rootModifiers?: readonly UiModifier[];
  /** Receives the island's node. */
  ref?: UiNodeRef;
  /**
   * Drawn on the canvas under the element: the element's stand-in, for
   * a `standIn` rule, or what shows where the element is cut. Bind its
   * visibility to `onStandIn` to draw it only when the element is hidden.
   */
  children?: UiChild;
  /** Whether the canvas should draw the stand-in now, as it changes. */
  onStandIn?: (showing: boolean) => void;
}

const BOX_PROPS = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'margin',
  'selfX',
  'selfY',
  'padding',
  'x',
  'y',
  'overflow',
  'backgroundColor',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'description',
  'states',
  'disabled'
] as const satisfies readonly (keyof IslandBoxProps)[];

/**
 * A box in the layout that a real DOM element covers.
 *
 * The box is an ordinary node: it is laid out, takes the focus in Tab
 * order, has a semantics record, and is cut by its scroll containers.
 * The element is made on the shell by the factory registered for `of`,
 * and placed over the box once a frame. Values reach the element as
 * `props`; what the element says comes back to `onEvent`, which calls a
 * channel command as any handler does.
 *
 *   <Island of={StoreMap} props={{ lat, lng }} onEvent={event => stores.send.pick(event.picked)}
 *           width="fill" height={320} label="Store map" />
 *
 * The element trails its box by a frame while the box moves, because
 * the canvas reaches the screen from the render worker and the element
 * from the main thread. `standIn` hides it while it moves and draws
 * `children` in its place, for an element whose look the canvas can
 * draw. The islands guide has the numbers.
 */
export function Island<P, E>(inputs: Inputs<IslandProps<P, E>>, ctx: ComponentContext): UiChild {
  const service = ctx.inject(IslandService);
  const focusService = ctx.inject(FocusService);
  let handle: IslandHandle | null = null;
  let node: UiNode | null = null;
  const subscriptions: { unsubscribe(): void }[] = [];

  const detach = (): void => {
    for (const subscription of subscriptions.splice(0)) {
      subscription.unsubscribe();
    }
    handle?.detach();
    handle = null;
    inputs.controller.value?.bind(null, null);
  };

  const ref = (next: UiNode | null): void => {
    inputs.ref.value?.(next);
    if (next === node) {
      return;
    }
    detach();
    node = next;
    if (next === null) {
      return;
    }
    const attached = service.attach(
      next,
      {
        kind: inputs.of.value.kind,
        standIn: inputs.standIn.value ?? 'never',
        onEvent: event => inputs.onEvent.value?.(event as E),
        onSubmit: () => inputs.onSubmit.value?.()
      },
      inputs.props.value
    );
    handle = attached;
    inputs.controller.value?.bind(attached, () => focusService.focus(next));
    let first = true;
    subscriptions.push(
      (inputs.props as unknown as Observable<P>).subscribe(props => {
        // The first value is the one `attach` was given.
        if (first) {
          first = false;
          return;
        }
        attached.setProps(props);
      }),
      attached.standIn.subscribe(showing => inputs.onStandIn.value?.(showing))
    );
  };
  ctx.onUnmount(detach);

  const layout: Record<string, unknown> = {};
  const cells = inputs as unknown as Record<string, InputCell<unknown> | undefined>;
  for (const name of BOX_PROPS) {
    const cell = cells[name];
    if (cell !== undefined && cell.value !== undefined) {
      layout[name] = cell;
    }
  }

  return Box(
    {
      ...layout,
      ...(inputs.rootModifiers.value === undefined ? {} : { modifiers: inputs.rootModifiers.value }),
      ref,
      focusable: inputs.focusable.value ?? true,
      role: inputs.role.value ?? 'group',
      label: inputs.label,
      // The element takes its own presses; a press that reaches the
      // canvas here is one the element was cut away under, and belongs
      // to whatever is drawn there.
      hitTestable: true
    },
    // Followed, not read once: a parent drawing the island again in
    // place sends new children to the same component.
    inputs.children.pipe(map(children => children ?? []))
  );
}
