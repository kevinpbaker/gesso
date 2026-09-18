import { afterEach, describe, expect, it } from 'vitest';

import { WorkerApp } from './WorkerApp';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * What the shell costs the main thread per input, and per dragged
 * window edge.
 *
 * All three of the things pinned here are properties of the wiring
 * rather than of a function: a size held back until the worker
 * answers, a layout flush that no longer happens per pointermove, and
 * a hover move that waits a frame but never overtakes the event that
 * superseded it. So these specs reach for the private wiring —
 * `observeResize` and `attachInput` — instead of `mount`, which wants
 * an `OffscreenCanvas`, a real `Worker` and a document to put a canvas
 * in. What is exercised is exactly the code a browser runs; only the
 * DOM and the worker on either side of it are doubles, in the way
 * `SemanticsMirror.spec` and `EditingProxy.spec` double them.
 */
interface Internals {
  renderWorker: unknown;
  observeResize(element: HTMLElement): void;
  attachInput(canvas: HTMLCanvasElement): () => void;
  handleWorkerMessage(event: MessageEvent<RuntimeToShellMessage>): void;
}

type Resize = Extract<ShellToRuntimeMessage, { type: 'resize' }>;

/** A canvas that counts what a layout flush would have cost. */
class FakeCanvas {
  readonly listeners = new Map<string, (event: never) => void>();
  /** How many times anything has asked the DOM where this canvas is. */
  rectReads = 0;
  left = 20;
  top = 10;

  getBoundingClientRect(): DOMRect {
    this.rectReads += 1;
    return { left: this.left, top: this.top, width: 800, height: 600 } as DOMRect;
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  focus(): void {}

  setPointerCapture(): void {}

  dispatch(type: string, event: unknown): void {
    const listener = this.listeners.get(type);
    if (listener === undefined) {
      throw new Error(`nothing is listening for '${type}'`);
    }
    listener(event as never);
  }
}

interface Harness {
  app: WorkerApp;
  internals: Internals;
  canvas: FakeCanvas;
  /** Every message the shell has posted at the render worker. */
  posts: ShellToRuntimeMessage[];
  resizes: () => Resize[];
  /** The ResizeObserver reports a new content box. */
  observe: (width: number, height: number) => void;
  /** The worker says it has applied a size. */
  acknowledge: (width: number, height: number, dpr?: number) => void;
  /** Runs whatever `requestAnimationFrame` callbacks are waiting. */
  frame: () => void;
  /** Fires a listener the shell put on the window. */
  fireWindow: (type: string) => void;
  restore: () => void;
}

function harness(): Harness {
  const scope = globalThis as Record<string, unknown>;
  const before = {
    window: scope.window,
    document: scope.document,
    requestAnimationFrame: scope.requestAnimationFrame,
    cancelAnimationFrame: scope.cancelAnimationFrame,
    ResizeObserver: scope.ResizeObserver
  };

  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  scope.requestAnimationFrame = (callback: () => void): number => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, callback);
    return id;
  };
  scope.cancelAnimationFrame = (id: number): void => {
    frames.delete(id);
  };

  const windowListeners = new Map<string, () => void>();
  scope.window = {
    devicePixelRatio: 2,
    addEventListener: (type: string, listener: () => void) => windowListeners.set(type, listener),
    removeEventListener: (type: string) => windowListeners.delete(type)
  };
  scope.document = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  let notify: ((entries: { contentRect: { width: number; height: number } }[]) => void) | undefined;
  class FakeResizeObserver {
    constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
      notify = callback;
    }
    observe(): void {}
    disconnect(): void {}
  }
  scope.ResizeObserver = FakeResizeObserver;

  const posts: ShellToRuntimeMessage[] = [];
  const app = new WorkerApp({ renderWorker: () => ({}) as unknown as Worker });
  const internals = app as unknown as Internals;
  internals.renderWorker = { postMessage: (message: ShellToRuntimeMessage) => posts.push(message) };
  const canvas = new FakeCanvas();

  return {
    app,
    internals,
    canvas,
    posts,
    resizes: () => posts.filter((message): message is Resize => message.type === 'resize'),
    observe: (width, height) => notify?.([{ contentRect: { width, height } }]),
    acknowledge: (width, height, dpr = 2) => {
      internals.handleWorkerMessage({
        data: { type: 'resized', width, height, dpr }
      } as MessageEvent<RuntimeToShellMessage>);
    },
    frame: () => {
      const waiting = [...frames.values()];
      frames.clear();
      for (const callback of waiting) {
        callback();
      }
    },
    fireWindow: type => {
      const listener = windowListeners.get(type);
      if (listener === undefined) {
        throw new Error(`the shell is not listening for window '${type}'`);
      }
      listener();
    },
    restore: () => {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) {
          delete scope[key];
        } else {
          scope[key] = value;
        }
      }
    }
  };
}

function pointer(options: { x: number; y: number; buttons?: number; at?: number }): PointerEvent {
  return {
    clientX: options.x,
    clientY: options.y,
    buttons: options.buttons ?? 0,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    timeStamp: options.at ?? 0,
    preventDefault: () => {}
  } as unknown as PointerEvent;
}

function wheel(): WheelEvent {
  return {
    clientX: 100,
    clientY: 100,
    deltaX: 0,
    deltaY: 10,
    deltaMode: 0,
    wheelDeltaY: -120,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    timeStamp: 5,
    preventDefault: () => {}
  } as unknown as WheelEvent;
}

function key(): KeyboardEvent {
  return {
    key: 'a',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    timeStamp: 6,
    preventDefault: () => {}
  } as unknown as KeyboardEvent;
}

let active: Harness | undefined;

function setup(): Harness {
  active = harness();
  return active;
}

afterEach(() => {
  active?.restore();
  active = undefined;
});

/**
 * One resize in flight at a time.
 *
 * A resize costs the worker a full layout and a synchronous paint, and
 * a ResizeObserver delivers one per refresh while a window edge is
 * dragged. A worker slower than the display used to accumulate a queue
 * of sizes that were all already wrong, so the lag grew for the length
 * of the drag. What must survive that is the *last* size: it is the
 * one the window ended at, and nothing else in the sequence is visible
 * to anybody.
 */
describe('resize backpressure', () => {
  it('sends one size from a burst, then the latest once the worker answers', () => {
    const shell = setup();
    shell.internals.observeResize({} as HTMLElement);

    shell.observe(100, 100);
    // Three more refreshes' worth of drag, all while the worker is
    // still laying out the first.
    shell.observe(150, 100);
    shell.observe(200, 100);
    shell.observe(260, 100);

    expect(shell.resizes()).toEqual([{ type: 'resize', width: 100, height: 100, dpr: 2 }]);

    shell.acknowledge(100, 100);

    // The newest size, not the next one: the two in between were
    // overwritten rather than queued.
    expect(shell.resizes()).toEqual([
      { type: 'resize', width: 100, height: 100, dpr: 2 },
      { type: 'resize', width: 260, height: 100, dpr: 2 }
    ]);
  });

  it('always ends on the size the drag ended on', () => {
    const shell = setup();
    shell.internals.observeResize({} as HTMLElement);

    // A worker answering at roughly a third of the notification rate,
    // which is the case this exists for.
    let last = { width: 0, height: 0 };
    for (let step = 0; step < 40; step += 1) {
      const size = { width: 400 + step * 7, height: 300 + step };
      last = size;
      shell.observe(size.width, size.height);
      if (step % 3 === 0) {
        const inFlight = shell.resizes().at(-1);
        shell.acknowledge(inFlight?.width ?? 0, inFlight?.height ?? 0);
      }
    }
    // The drag ends, and the worker drains whatever it still owes.
    for (let drain = 0; drain < 4; drain += 1) {
      const inFlight = shell.resizes().at(-1);
      shell.acknowledge(inFlight?.width ?? 0, inFlight?.height ?? 0);
    }

    expect(shell.resizes().at(-1)).toEqual({ type: 'resize', ...last, dpr: 2 });
    // Far fewer layouts than notifications, which is the point.
    expect(shell.resizes().length).toBeLessThan(40);
  });

  it('does not ask for a layout it has already been given', () => {
    const shell = setup();
    shell.internals.observeResize({} as HTMLElement);

    shell.observe(100, 100);
    shell.observe(200, 100);
    shell.acknowledge(100, 100);
    // The drag has stopped, and the observer reports the settled size
    // once more — the size that is now in flight.
    shell.observe(200, 100);
    shell.acknowledge(200, 100);

    expect(shell.resizes()).toEqual([
      { type: 'resize', width: 100, height: 100, dpr: 2 },
      { type: 'resize', width: 200, height: 100, dpr: 2 }
    ]);
  });
});

/**
 * The canvas's position, read once instead of per event.
 *
 * `getBoundingClientRect` forces a synchronous style and layout flush
 * whenever the document is dirty, and `toLocal` ran one for every
 * pointermove, pointerup and wheel.
 */
describe('pointer coordinates', () => {
  it('reads the canvas position once for a run of moves', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    for (let step = 0; step < 6; step += 1) {
      shell.canvas.dispatch('pointermove', pointer({ x: 100 + step, y: 200 }));
      shell.frame();
    }

    expect(shell.canvas.rectReads).toBe(1);
    const moves = shell.posts.filter(message => message.type === 'pointerMove');
    expect(moves.at(-1)).toMatchObject({ x: 105 - 20, y: 200 - 10 });
  });

  it('forgets the position when something says the canvas may have moved', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200 }));
    shell.frame();
    expect(shell.canvas.rectReads).toBe(1);

    // An ancestor scrolled; the canvas is somewhere else now.
    shell.canvas.left = 60;
    shell.fireWindow('scroll');
    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200 }));
    shell.frame();

    expect(shell.canvas.rectReads).toBe(2);
    expect(shell.posts.filter(message => message.type === 'pointerMove').at(-1)).toMatchObject({ x: 40 });

    // And the window resized, which reflows the page around it.
    shell.fireWindow('resize');
    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200 }));
    shell.frame();
    expect(shell.canvas.rectReads).toBe(3);
  });

  it('re-reads on every press, so a gesture starts from the truth', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200 }));
    shell.frame();

    // Something moved the canvas with no event behind it — a CSS
    // transition on an ancestor is the honest case — so the cache is
    // stale and nothing has said so.
    shell.canvas.left = 120;
    shell.canvas.dispatch('pointerdown', pointer({ x: 200, y: 200, buttons: 1 }));

    expect(shell.canvas.rectReads).toBe(2);
    expect(shell.posts.filter(message => message.type === 'pointerDown').at(-1)).toMatchObject({ x: 80 });
  });
});

/**
 * Hover moves coalesced to one a frame, and never left behind the
 * event that superseded them.
 */
describe('hover coalescing', () => {
  it('posts the newest hover once a frame and nothing before it', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200, at: 1 }));
    shell.canvas.dispatch('pointermove', pointer({ x: 140, y: 200, at: 2 }));
    shell.canvas.dispatch('pointermove', pointer({ x: 180, y: 240, at: 3 }));

    expect(shell.posts.filter(message => message.type === 'pointerMove')).toEqual([]);

    shell.frame();

    const moves = shell.posts.filter(message => message.type === 'pointerMove');
    expect(moves).toHaveLength(1);
    // The newest event's position and its own timestamp, not the
    // frame's: the latency reading still measures from the input.
    expect(moves[0]).toMatchObject({ x: 160, y: 230, at: performance.timeOrigin + 3 });
  });

  it('forwards every point while a button is down', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    // A drag, a text selection, a scrollbar thumb and the touch
    // scroller's fling velocity are all computed from the stream, so
    // thinning it would change behaviour rather than save work.
    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200, buttons: 1, at: 1 }));
    shell.canvas.dispatch('pointermove', pointer({ x: 140, y: 200, buttons: 1, at: 2 }));
    shell.canvas.dispatch('pointermove', pointer({ x: 180, y: 200, buttons: 1, at: 3 }));

    expect(shell.posts.filter(message => message.type === 'pointerMove')).toHaveLength(3);
  });

  it('flushes a held hover before the press that supersedes it', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200, at: 1 }));
    shell.canvas.dispatch('pointerdown', pointer({ x: 100, y: 200, buttons: 1, at: 2 }));
    // The frame the hover was waiting for, had it still been waiting.
    shell.frame();

    expect(
      shell.posts
        .filter(message => message.type === 'pointerMove' || message.type === 'pointerDown')
        .map(message => message.type)
    ).toEqual(['pointerMove', 'pointerDown']);
  });

  it('flushes a held hover before a release, a wheel and a key', () => {
    const shell = setup();
    shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);
    const order = (): string[] =>
      shell.posts
        .filter(
          message =>
            message.type === 'pointerMove' ||
            message.type === 'pointerUp' ||
            message.type === 'wheel' ||
            message.type === 'keyDown'
        )
        .map(message => message.type);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200, at: 1 }));
    shell.canvas.dispatch('pointerup', pointer({ x: 100, y: 200, at: 2 }));
    shell.canvas.dispatch('pointermove', pointer({ x: 110, y: 200, at: 3 }));
    shell.canvas.dispatch('wheel', wheel());
    shell.canvas.dispatch('pointermove', pointer({ x: 120, y: 200, at: 5 }));
    shell.canvas.dispatch('keydown', key());
    shell.frame();

    expect(order()).toEqual(['pointerMove', 'pointerUp', 'pointerMove', 'wheel', 'pointerMove', 'keyDown']);
  });

  it('drops a held hover when the input is detached', () => {
    const shell = setup();
    const detach = shell.internals.attachInput(shell.canvas as unknown as HTMLCanvasElement);

    shell.canvas.dispatch('pointermove', pointer({ x: 100, y: 200, at: 1 }));
    detach();
    shell.frame();

    // The surface it was measured against has gone; posting it would
    // hover a canvas the shell no longer owns.
    expect(shell.posts.filter(message => message.type === 'pointerMove')).toEqual([]);
  });
});
