/**
 * The name of a kind of DOM island, and the shapes that cross for it.
 *
 * A DOM island is a box in the layout that a real DOM element covers:
 * the render worker owns the box, the shell owns the element. The two
 * threads meet at a token, as they do for a channel, and the token
 * lives in the module both of them import. It holds a name and two
 * types and no implementation, so importing it costs neither thread
 * anything.
 *
 *   // stores.contract.ts
 *   export const StoreMap = island<{ lat: number; lng: number }, { picked: string }>('store-map');
 *
 *   // main.ts (the shell)
 *   createApp({ islands: [provideIsland(StoreMap, mapFactory)] }).mount('#app');
 *
 *   // stores.render.worker.tsx
 *   <Island of={StoreMap} props={{ lat, lng }} onEvent={event => stores.send.pick(event.picked)} />
 *
 * `P` is what the render worker sends the element, `E` what the element
 * sends back. Both cross by structured clone, so both are plain data.
 */
export interface IslandToken<P, E> {
  /** Unique per application: the shell finds the factory by it. */
  readonly kind: string;
  /** Type only; never set. Carries `P` and `E` from the token to its uses. */
  readonly types?: { readonly props: P; readonly event: E };
}

/** Declares a kind of island. See `IslandToken`. */
export function island<P = Record<string, never>, E = never>(kind: string): IslandToken<P, E> {
  return { kind };
}

/**
 * What a factory is handed for each element it makes.
 *
 * `emit` is the element's only way back to the render worker: the event
 * reaches the island's `onEvent` there, after the frame it arrives in.
 * `form` is the shell's one `<form>` for a name, shared by every island
 * that names it, which is what lets a password manager see a username
 * field and a password field as one sign-in form.
 */
export interface IslandContext<E> {
  readonly document: Document;
  emit(event: E): void;
  form(name: string): HTMLFormElement;
}

/**
 * Whether the props an update carries are as new as what the element
 * has said since.
 *
 * What an element emits crosses to the render worker, and whatever it
 * changes comes back as props a frame or more later. An element that
 * applied every update would apply one sent before its last event over
 * that event. So each event is numbered, each update carries the last
 * number the worker had handled, and `current` is false while the
 * element is ahead of the update.
 *
 * It is necessary and not sufficient for a value the element edits: a
 * value that goes through a channel comes back after the worker has
 * handled later events, so it can be `current` and still old. A text
 * field also has to tell its own echoes from a value the application
 * set; `nativeInputIsland` does it with a version the render worker
 * bumps only for a value it did not get from the field.
 */
export interface IslandUpdateInfo {
  readonly current: boolean;
}

/**
 * One element and what the shell can do with it.
 *
 * Only `element` is required. The shell positions it, sizes it, cuts it
 * where a canvas overlay covers it and moves DOM focus to it; the rest
 * is the factory's to answer.
 */
export interface IslandInstance<P> {
  readonly element: HTMLElement;
  /** New props from the render worker. */
  update?(props: P, info: IslandUpdateInfo): void;
  /** A message posted with an `IslandController`. */
  receive?(message: unknown): void;
  /** Takes DOM focus; `element.focus()` when left out. */
  focus?(): void;
  /** The element is leaving; it is removed from the document after this. */
  dispose?(): void;
  /**
   * Who scrolls under a wheel over the element: `forward` (the default)
   * sends it on to the canvas, so a list keeps scrolling with the
   * pointer over a field in it; `own` leaves it with the element, for a
   * map or an editor that scrolls itself.
   */
  readonly wheel?: 'forward' | 'own';
}

/** Makes the element for each island of one kind, on the shell. */
export interface IslandFactory<P, E> {
  create(props: P, context: IslandContext<E>): IslandInstance<P>;
}

/**
 * A factory registered under a token's kind, as `createApp({ islands })`
 * takes it. `load` is either the factory or a function that fetches it,
 * so a kind the first screen does not use costs the shell nothing until
 * one mounts.
 */
export interface IslandRegistration {
  readonly kind: string;
  // `any` for the reason a channel registry holds its tokens as `any`:
  // one list holds every kind, and each kind's types were checked where
  // `provideIsland` was called.
  readonly load: IslandFactory<any, any> | (() => Promise<IslandFactory<any, any>>);
}

/**
 * Registers the shell's factory for a kind of island.
 *
 * A function in place of the factory is called when the first island of
 * the kind mounts, and its promise awaited:
 *
 *   provideIsland(StoreMap, () => import('./map').then(module => module.mapFactory))
 */
export function provideIsland<P, E>(
  token: IslandToken<P, E>,
  factory: IslandFactory<P, E> | (() => Promise<IslandFactory<P, E>>)
): IslandRegistration {
  return { kind: token.kind, load: factory };
}

/**
 * A factory for an island that is just an element: made once, and told
 * nothing afterwards unless `update` is given.
 *
 *   provideIsland(Badge, elementIsland(({ document }) => document.createElement('status-badge')))
 *
 * For a custom element, a third-party widget's root, or anything that
 * reads its configuration once.
 */
export function elementIsland<P, E>(
  create: (context: IslandContext<E>, props: P) => HTMLElement,
  update?: (element: HTMLElement, props: P, info: IslandUpdateInfo) => void
): IslandFactory<P, E> {
  return {
    create(props, context) {
      const element = create(context, props);
      return update === undefined
        ? { element }
        : { element, update: (next: P, info: IslandUpdateInfo) => update(element, next, info) };
    }
  };
}
