import type { IslandContext, IslandFactory, IslandInstance, IslandRegistration } from './islandToken';
import { intersect, subtractRects } from './islandGeometry';
import type {
  IslandMount,
  IslandPlacement,
  IslandRect,
  IslandShellMessage,
  IslandStandIn,
  IslandUpdate
} from './IslandProtocol';

/**
 * Where the host sends what its elements do. `WorkerApp` posts to the
 * render worker; each method is the shell's own path for that input, so
 * a wheel or a Tab over an element is handled exactly as one over the
 * canvas would be.
 */
export interface IslandHostSink {
  post(message: IslandShellMessage): void;
  /** A hover move over an element, so hover and the cursor elsewhere clear. */
  hover(event: PointerEvent): void;
  /** A wheel over an element that does not scroll itself. */
  wheel(event: WheelEvent): void;
  /** Tab, Shift+Tab or an unhandled Escape in an element. */
  key(event: KeyboardEvent, down: boolean): void;
  /** DOM focus left the application from an element. */
  blur(): void;
  /**
   * Whether an element outside the canvas, the island layer and the
   * mirror is the application's too: the editing proxy's field, which
   * takes DOM focus when a canvas text field gets the app's.
   */
  owns?(target: Node): boolean;
}

/**
 * The semantics mirror, as the host needs it: told which records are
 * islands, so it points at their elements rather than standing in for
 * them, and leaves their focus to the host.
 */
export interface IslandMirrorLink {
  readonly element: HTMLElement;
  linkIslands(target: IslandMirrorTarget | null): void;
  refreshIsland(id: string): void;
}

/** What the mirror asks the host. */
export interface IslandMirrorTarget {
  has(id: string): boolean;
  /** The DOM id of the island's element, for `aria-owns`; undefined until it exists. */
  elementId(id: string): string | undefined;
}

interface HostedIsland {
  readonly id: string;
  readonly kind: string;
  readonly standIn: IslandStandIn;
  props: unknown;
  /** The last event number this island emitted. */
  emitted: number;
  /** The last event number the worker had handled, from the last update. */
  seen: number;
  instance: IslandInstance<unknown> | null;
  placement: IslandPlacement | null;
  form: string | undefined;
  gone: boolean;
}

let hosts = 0;

/**
 * The shell's half of DOM islands: makes each element with its factory,
 * puts it over its box once a frame, and carries what it does back.
 *
 * Loaded with `import()` by `WorkerApp`, and only for an application
 * that registered an island, so a shell with none carries none of this.
 *
 * Every element sits in one layer over the canvas. The layer is placed
 * in document coordinates rather than fixed to the viewport, so the page
 * scrolling moves it with the canvas on the compositor, with no script
 * in between; a canvas that moves for some other reason is caught by the
 * same three signals the semantics mirror listens for.
 *
 * Each element is moved with a transform, sized, faded, and cut with a
 * `clip-path` to the part of its box its scroll containers show, less
 * what the canvas draws over it. A cut-away part takes no pointer
 * events, so a press there falls through to the canvas and reaches the
 * menu drawn over the field. Hidden is `opacity: 0` and never
 * `visibility: hidden` or `display: none`, both of which take DOM focus
 * from a field, and an IME composition with it.
 */
export class IslandHost implements IslandMirrorTarget {
  private readonly doc: Document;
  private readonly layer: HTMLElement;
  private readonly islands = new Map<string, HostedIsland>();
  private readonly factories = new Map<
    string,
    Promise<IslandFactory<unknown, unknown>> | IslandFactory<unknown, unknown>
  >();
  private readonly registrations = new Map<string, IslandRegistration>();
  private readonly forms = new Map<string, HTMLFormElement>();
  private readonly detach: () => void;
  private readonly prefix = `gesso-island-${hosts++}-`;
  private pendingFocus: string | null = null;
  /** True while this class is the one moving DOM focus or submitting a form. */
  private applying = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    registrations: readonly IslandRegistration[],
    private readonly sink: IslandHostSink,
    private readonly mirror: IslandMirrorLink | null = null
  ) {
    this.doc = canvas.ownerDocument;
    for (const registration of registrations) {
      this.registrations.set(registration.kind, registration);
    }
    const layer = this.doc.createElement('div');
    layer.setAttribute('data-gesso-islands', '');
    Object.assign(layer.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      margin: '0',
      padding: '0',
      border: '0',
      overflow: 'visible',
      // The layer takes nothing; each element opts back in.
      pointerEvents: 'none',
      // Under the semantics mirror, which takes no pointer at all.
      zIndex: '2147483645'
    } as Partial<CSSStyleDeclaration>);
    this.doc.body.appendChild(layer);
    this.layer = layer;
    this.detach = this.listen();
    mirror?.linkIslands(this);
  }

  /** The layer, for tests and for a shell that wants to inspect it. */
  get element(): HTMLElement {
    return this.layer;
  }

  has(id: string): boolean {
    return this.islands.has(id);
  }

  elementId(id: string): string | undefined {
    const element = this.islands.get(id)?.instance?.element;
    return element === undefined || element.id === '' ? undefined : element.id;
  }

  /** Applies one frame's change, in the order `IslandUpdate` gives. */
  apply(update: IslandUpdate): void {
    if (this.disposed) {
      return;
    }
    for (const id of update.unmounts ?? []) {
      this.unmount(id);
    }
    for (const mount of update.mounts ?? []) {
      this.mount(mount);
    }
    for (const { id, props, seen } of update.props ?? []) {
      const island = this.islands.get(id);
      if (island === undefined) {
        continue;
      }
      island.props = props;
      island.seen = seen;
      island.instance?.update?.(props, { current: seen >= island.emitted });
    }
    for (const placement of update.places ?? []) {
      const island = this.islands.get(placement.id);
      if (island !== undefined) {
        island.placement = placement;
        this.place(island);
      }
    }
    if (update.focused !== undefined) {
      this.applyFocus(update.focused);
    }
    for (const { id, message } of update.posts ?? []) {
      this.islands.get(id)?.instance?.receive?.(message);
    }
    for (const name of update.submits ?? []) {
      const form = this.forms.get(name);
      if (form === undefined) {
        continue;
      }
      // Prevented in `listen`, and not reported back: the canvas
      // button that asked has done what submitting means already.
      this.applying = true;
      try {
        form.requestSubmit();
      } finally {
        this.applying = false;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    // Deleting the entry being visited is safe in a Map's own iteration.
    for (const id of this.islands.keys()) {
      this.unmount(id);
    }
    this.detach();
    this.mirror?.linkIslands(null);
    this.layer.remove();
  }

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------

  private mount(mount: IslandMount): void {
    const island: HostedIsland = {
      id: mount.id,
      kind: mount.kind,
      standIn: mount.standIn,
      props: mount.props,
      emitted: 0,
      seen: 0,
      instance: null,
      placement: null,
      form: undefined,
      gone: false
    };
    this.unmount(mount.id);
    this.islands.set(mount.id, island);
    const factory = this.factoryFor(mount.kind);
    if (factory === null) {
      console.warn(
        `[gesso] No island factory for '${mount.kind}'. Register one: createApp({ islands: [provideIsland(token, factory)] }).`
      );
      return;
    }
    if (factory instanceof Promise) {
      void factory.then(
        loaded => {
          if (!island.gone && !this.disposed) {
            this.create(island, loaded);
          }
        },
        (error: unknown) => console.warn(`[gesso] The island factory for '${mount.kind}' failed to load:`, error)
      );
    } else {
      this.create(island, factory);
    }
  }

  private factoryFor(kind: string): Promise<IslandFactory<unknown, unknown>> | IslandFactory<unknown, unknown> | null {
    const known = this.factories.get(kind);
    if (known !== undefined) {
      return known;
    }
    const registration = this.registrations.get(kind);
    if (registration === undefined) {
      return null;
    }
    const load = registration.load;
    const factory = typeof load === 'function' ? load() : load;
    this.factories.set(kind, factory);
    if (factory instanceof Promise) {
      // Remembered resolved, so islands mounted after it loads are made at once.
      void factory.then(loaded => this.factories.set(kind, loaded)).catch(() => this.factories.delete(kind));
    }
    return factory;
  }

  private create(island: HostedIsland, factory: IslandFactory<unknown, unknown>): void {
    const context: IslandContext<unknown> = {
      document: this.doc,
      emit: event => {
        if (island.gone) {
          return;
        }
        island.emitted += 1;
        this.sink.post({ type: 'islandEvent', id: island.id, event, seq: island.emitted });
      },
      form: name => {
        island.form = name;
        return this.formFor(name);
      }
    };
    let instance: IslandInstance<unknown>;
    try {
      instance = factory.create(island.props, context);
    } catch (error) {
      console.warn(`[gesso] The island factory for '${island.kind}' threw:`, error);
      return;
    }
    island.instance = instance;
    const element = instance.element;
    if (element.id === '') {
      element.id = this.prefix + island.id;
    }
    element.setAttribute('data-gesso-island', island.id);
    Object.assign(element.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      margin: '0',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      transformOrigin: '0 0',
      opacity: '0'
    } as Partial<CSSStyleDeclaration>);
    if (element.parentNode === null) {
      this.layer.appendChild(element);
    }
    if (island.placement !== null) {
      this.place(island);
    }
    this.mirror?.refreshIsland(island.id);
    if (this.pendingFocus === island.id) {
      this.applyFocus(island.id);
    }
  }

  private unmount(id: string): void {
    const island = this.islands.get(id);
    if (island === undefined) {
      return;
    }
    island.gone = true;
    this.islands.delete(id);
    const instance = island.instance;
    if (instance !== null) {
      const hadFocus = instance.element.contains(this.doc.activeElement);
      try {
        instance.dispose?.();
      } finally {
        instance.element.remove();
      }
      if (hadFocus) {
        // Focus would fall to the body, and keys would stop reaching
        // the app; the canvas keeps them until the runtime says where.
        this.canvas.focus({ preventScroll: true });
      }
    }
    this.mirror?.refreshIsland(id);
    if (island.form !== undefined) {
      this.releaseForm(island.form);
    }
  }

  /**
   * The shell's one `<form>` for a name.
   *
   * `method="post"` and `novalidate`: a password manager reads a form
   * that would post as a sign-in, and validation is the application's,
   * drawn on its canvas, not the browser's bubble pointing at a
   * transparent field.
   */
  private formFor(name: string): HTMLFormElement {
    let form = this.forms.get(name);
    if (form === undefined) {
      form = this.doc.createElement('form');
      form.method = 'post';
      form.action = '';
      form.noValidate = true;
      form.setAttribute('name', name);
      form.setAttribute('data-gesso-island-form', name);
      form.style.margin = '0';
      this.layer.appendChild(form);
      this.forms.set(name, form);
    }
    return form;
  }

  /**
   * Takes a form away once no island names it. A sign-in form that goes
   * away after it was submitted is one of the signals a password manager
   * reads as a sign-in that worked.
   */
  private releaseForm(name: string): void {
    for (const island of this.islands.values()) {
      if (island.form === name) {
        return;
      }
    }
    this.forms.get(name)?.remove();
    this.forms.delete(name);
  }

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  /**
   * Writes an island's placement onto its element.
   *
   * Snapped to device pixels, because the canvas draws the frame around
   * it at device resolution and a fractional offset would put the text a
   * half pixel off the frame on one display and not on another.
   */
  private place(island: HostedIsland): void {
    const placement = island.placement;
    const element = island.instance?.element;
    if (placement === null || element === undefined) {
      return;
    }
    const style = element.style;
    const focused = element.contains(this.doc.activeElement);
    const visible = placement.visible ? intersect(placement.clip, placement.box) : null;
    const pieces = visible === null ? [] : subtractRects(visible, placement.cuts);
    if (pieces.length === 0) {
      style.opacity = '0';
      style.pointerEvents = 'none';
      return;
    }
    const dpr = this.doc.defaultView?.devicePixelRatio || 1;
    const snap = (value: number): number => Math.round(value * dpr) / dpr;
    const box = placement.box;
    const x = snap(box.x);
    const y = snap(box.y);
    style.transform = `translate(${x}px, ${y}px)`;
    style.width = `${snap(box.width)}px`;
    style.height = `${snap(box.height)}px`;
    const whole =
      pieces.length === 1 &&
      pieces[0]!.x <= box.x &&
      pieces[0]!.y <= box.y &&
      pieces[0]!.width >= box.width &&
      pieces[0]!.height >= box.height;
    style.clipPath = whole ? '' : clipPathFor(pieces, box);
    // Hidden by its stand-in rule: the canvas draws it instead. A field
    // the runtime has not caught up with yet (a click that just put DOM
    // focus in it) shows at once rather than a frame later.
    const concealed =
      (island.standIn !== 'never' && placement.moving) ||
      (island.standIn === 'unfocused' && !placement.focused && !focused);
    style.opacity = concealed ? '0' : String(placement.opacity);
    // Still pressable while concealed: a click on an unfocused field
    // has to reach the field to focus it. Not under a backdrop, whose
    // press it is.
    style.pointerEvents = placement.inert ? 'none' : 'auto';
  }

  // ---------------------------------------------------------------------------
  // Focus and input
  // ---------------------------------------------------------------------------

  private applyFocus(id: string | null): void {
    this.pendingFocus = id;
    if (id === null) {
      if (this.layer.contains(this.doc.activeElement)) {
        this.withApplying(() => this.canvas.focus({ preventScroll: true }));
      }
      return;
    }
    const instance = this.islands.get(id)?.instance;
    if (instance === null || instance === undefined) {
      return;
    }
    this.pendingFocus = null;
    if (instance.element.contains(this.doc.activeElement)) {
      return;
    }
    this.withApplying(() => {
      if (instance.focus !== undefined) {
        instance.focus();
      } else {
        instance.element.focus({ preventScroll: true });
      }
    });
  }

  private withApplying(run: () => void): void {
    this.applying = true;
    try {
      run();
    } finally {
      this.applying = false;
    }
  }

  /** The island an event's target is in. */
  private islandOf(target: EventTarget | null): HostedIsland | undefined {
    let node = target as Node | null;
    while (node !== null && node !== this.layer) {
      if (node instanceof Element) {
        const id = node.getAttribute('data-gesso-island');
        if (id !== null) {
          return this.islands.get(id);
        }
      }
      node = node.parentNode;
    }
    return undefined;
  }

  private insideApp(target: EventTarget | null): boolean {
    const node = target as Node | null;
    return (
      node !== null &&
      (node === this.canvas ||
        this.layer.contains(node) ||
        (this.mirror?.element.contains(node) ?? false) ||
        this.sink.owns?.(node) === true)
    );
  }

  private listen(): () => void {
    const layer = this.layer;
    const onFocusIn = (event: FocusEvent): void => {
      const island = this.islandOf(event.target);
      if (island === undefined) {
        return;
      }
      this.place(island);
      if (!this.applying) {
        this.sink.post({ type: 'islandFocus', id: island.id });
      }
    };
    const onFocusOut = (event: FocusEvent): void => {
      const island = this.islandOf(event.target);
      if (island === undefined) {
        return;
      }
      // Not the window losing focus, which blurs too and gives it back.
      if (this.doc.hasFocus() && !this.insideApp(event.relatedTarget)) {
        this.sink.blur();
      }
      // After the browser has moved focus, so `place` reads where it went.
      queueMicrotask(() => {
        if (!island.gone) {
          this.place(island);
        }
      });
    };
    const isTab = (event: KeyboardEvent): boolean =>
      event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (this.islandOf(event.target) === undefined) {
        return;
      }
      if (isTab(event)) {
        // The app's focus order, not the page's.
        event.preventDefault();
        this.sink.key(event, true);
      } else if (event.key === 'Escape' && !event.defaultPrevented) {
        this.sink.key(event, true);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (this.islandOf(event.target) !== undefined && (isTab(event) || event.key === 'Escape')) {
        this.sink.key(event, false);
      }
    };
    const onWheel = (event: WheelEvent): void => {
      const island = this.islandOf(event.target);
      if (island !== undefined && island.instance?.wheel !== 'own') {
        this.sink.wheel(event);
      }
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (event.buttons === 0 && this.islandOf(event.target) !== undefined) {
        this.sink.hover(event);
      }
    };
    const onSubmit = (event: Event): void => {
      const form = event.target as HTMLFormElement;
      const name = form.getAttribute('data-gesso-island-form');
      if (name === null) {
        return;
      }
      // A page that navigated on a sign-in would take the app with it.
      event.preventDefault();
      if (this.applying) {
        return;
      }
      let from: HostedIsland | undefined;
      for (const island of this.islands.values()) {
        if (island.form !== name) {
          continue;
        }
        if (island.instance?.element.contains(this.doc.activeElement) === true) {
          from = island;
          break;
        }
        from ??= island;
      }
      this.sink.post({ type: 'islandSubmit', form: name, id: from?.id ?? null });
    };
    layer.addEventListener('focusin', onFocusIn);
    layer.addEventListener('focusout', onFocusOut);
    layer.addEventListener('keydown', onKeyDown);
    layer.addEventListener('keyup', onKeyUp);
    layer.addEventListener('wheel', onWheel, { passive: false });
    layer.addEventListener('pointermove', onPointerMove);
    layer.addEventListener('submit', onSubmit);

    // Where the canvas is, in the layer's own coordinates.
    const view = this.doc.defaultView;
    let left = 0;
    let top = 0;
    const sync = (): void => {
      const canvasBox = this.canvas.getBoundingClientRect();
      const layerBox = layer.getBoundingClientRect();
      const nextLeft = left + canvasBox.left - layerBox.left;
      const nextTop = top + canvasBox.top - layerBox.top;
      if (Math.abs(nextLeft - left) > 0.01 || Math.abs(nextTop - top) > 0.01) {
        left = nextLeft;
        top = nextTop;
        layer.style.left = `${left}px`;
        layer.style.top = `${top}px`;
      }
    };
    sync();
    view?.addEventListener('resize', sync);
    view?.addEventListener('scroll', sync, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(this.canvas);
    return () => {
      layer.removeEventListener('focusin', onFocusIn);
      layer.removeEventListener('focusout', onFocusOut);
      layer.removeEventListener('keydown', onKeyDown);
      layer.removeEventListener('keyup', onKeyUp);
      layer.removeEventListener('wheel', onWheel);
      layer.removeEventListener('pointermove', onPointerMove);
      layer.removeEventListener('submit', onSubmit);
      view?.removeEventListener('resize', sync);
      view?.removeEventListener('scroll', sync, true);
      observer?.disconnect();
    };
  }
}

/**
 * A `clip-path` showing `pieces` (rectangles that do not overlap) of an
 * element whose top-left corner is at `box`'s. One sub-path per piece,
 * all wound the same way, so the nonzero rule fills their union.
 */
export function clipPathFor(pieces: readonly IslandRect[], box: IslandRect): string {
  const paths = pieces.map(piece => {
    const x = round(piece.x - box.x);
    const y = round(piece.y - box.y);
    return `M${x} ${y}H${round(x + piece.width)}V${round(y + piece.height)}H${x}Z`;
  });
  return `path('${paths.join(' ')}')`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
