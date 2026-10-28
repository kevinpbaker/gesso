import {
  Column,
  UiManualFrameClock,
  lightTheme,
  mediaLoadsInFlight,
  type CanvasHost,
  type UiChild,
  type UiTheme
} from 'gesso-core';

import type { ChannelRegistry } from '../channel/ChannelRegistry';
import type { FrameworkChild } from '../ComponentElement';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { claimErrors } from './claimedErrors';
import { GessoRuntime } from './GessoRuntime';

/**
 * A tree drawn once, off screen, to a PNG.
 *
 * What an agent designing a screen needs most is to see it. The screen
 * in front of the person is one size and one state; a mock is wanted at
 * a phone's width and a desktop's, and before anything has mounted it.
 * So the tree gets a runtime of its own, on a canvas nobody sees, with
 * a clock this drives by hand: it runs frames until the tree stops
 * asking for them and no picture is still on its way (a picture being
 * fetched asks for no frames until it arrives), sizes the canvas to the
 * content, draws, and is thrown away.
 *
 * The runtime is the same one the application uses, with Canvas2D, so
 * the picture is the application's pixels and not an approximation of
 * them: the same layout engine, text shaping and paint.
 */

/** A canvas this can read a PNG back from: an `OffscreenCanvas`, in a worker or a page. */
export interface PictureCanvas extends CanvasHost {
  convertToBlob(options?: { type?: string }): Promise<Blob>;
}

export interface RenderFrameOptions {
  /** Its width, in logical pixels. */
  readonly width: number;
  /**
   * Its height, which content that fills its parent fills: give one
   * for a whole screen. Left out, the frame is as tall as its content,
   * up to `maxHeight`, which is right for a component or a section; a
   * screen that fills the window would collapse to what is in it.
   */
  readonly height?: number;
  /** Device pixels per logical pixel (default 1). */
  readonly scale?: number;
  /** The theme it is drawn in (default the light theme). */
  readonly theme?: UiTheme;
  /** The tallest a frame grows to fit its content (default 4000). */
  readonly maxHeight?: number;
  /** Channels for the components in it to replicate: the running application's, to show its data. */
  readonly channels?: ChannelRegistry;
  /**
   * Services for the components in it to inject: the running
   * application's. The frame's runtime registers its own over them
   * rather than borrowing them, since those belong to the window.
   */
  readonly services?: ServiceRegistry;
  /** The longest to wait for the tree to stop asking for frames, in milliseconds (default 2000). */
  readonly settleMs?: number;
  /**
   * Whether an error thrown while the frame is drawn is the frame's own,
   * to keep it from the application's error handling: a draft an agent
   * got wrong should not put an error over the person's screen (see
   * `claimedErrors.ts`). One it does not claim is still listed in
   * `errors`, and still reported.
   */
  readonly claims?: (error: unknown) => boolean;
  /** Makes the canvas (default `new OffscreenCanvas`). */
  readonly createCanvas?: (width: number, height: number) => PictureCanvas;
}

export interface RenderedFrame {
  readonly png: Uint8Array;
  /** Logical pixels; the PNG is these times `scale`. */
  readonly width: number;
  readonly height: number;
  /** Whether the content was taller than `maxHeight`, and is cut off there. */
  readonly clipped: boolean;
  /** Whether the content had no height of its own: a closed popup, say, or one waiting on inputs. */
  readonly empty: boolean;
  /**
   * What was thrown and not caught in this thread while the frame was
   * drawn. A component reading an input it was not given throws from a
   * subscription, which no frame catches, and the picture alone would
   * only show that nothing was drawn. The thread is shared, so an error
   * here is likely the frame's and not certainly.
   */
  readonly errors: readonly string[];
}

export async function renderFrame(root: FrameworkChild, options: RenderFrameOptions): Promise<RenderedFrame> {
  const width = Math.round(options.width);
  if (!(width > 0)) {
    throw new Error(`A frame needs a width above zero, not ${options.width}.`);
  }
  const scale = options.scale ?? 1;
  const maxHeight = options.maxHeight ?? 4000;
  const probe = options.height ?? maxHeight;
  const createCanvas =
    options.createCanvas ?? ((w: number, h: number) => new OffscreenCanvas(w, h) as unknown as PictureCanvas);
  const canvas = createCanvas(width * scale, probe * scale);

  // The layout root stretches the app root over the canvas. The frame
  // inside it fills that when a height was asked for, so a screen fills
  // it too, and otherwise keeps its content's height, which is then
  // read off it.
  const frame = Column(options.height === undefined ? {} : { flex: 1 }, root as UiChild);
  let clock!: UiManualFrameClock;
  const runtime = new GessoRuntime({
    // Painted in the theme's background, as a window is: a canvas left
    // transparent shows dark-theme content on whatever the viewer's
    // ground is, which is usually white.
    root: Column({ theme: options.theme ?? lightTheme, backgroundColor: 'background' }, frame),
    canvas,
    renderer: 'canvas2d',
    width,
    height: probe,
    dpr: scale,
    ...(options.channels === undefined ? {} : { channels: options.channels }),
    services: new ServiceRegistry(options.services),
    clock: callback => (clock = new UiManualFrameClock(callback))
  });
  let failure: string | null = null;
  runtime.onFrameError((message, stack) => {
    failure ??= stack ?? message;
  });
  const errors: string[] = [];
  const uncaught = (event: Event) => {
    const reason =
      (event as ErrorEvent).error ?? (event as PromiseRejectionEvent).reason ?? (event as ErrorEvent).message;
    errors.push(reason instanceof Error ? reason.message : String(reason));
    if (options.claims?.(reason) === true) {
      // Handled: a worker's failure goes no further than the worker.
      event.preventDefault();
    }
  };
  const scope = globalThis as {
    addEventListener?: EventTarget['addEventListener'];
    removeEventListener?: EventTarget['removeEventListener'];
  };
  scope.addEventListener?.('error', uncaught);
  scope.addEventListener?.('unhandledrejection', uncaught);
  const release = options.claims === undefined ? () => {} : claimErrors(options.claims);
  try {
    runtime.start();
    let now = 0;
    const settle = async () => {
      const deadline = Date.now() + (options.settleMs ?? 2000);
      let quiet = 0;
      while (quiet < 3 && Date.now() < deadline) {
        if (clock.isPending) {
          clock.tick((now += 16));
          quiet = 0;
        } else if (mediaLoadsInFlight() > 0) {
          // Quiet only because a picture is still being fetched or
          // decoded: it asks for a frame when it lands.
          quiet = 0;
        } else {
          quiet++;
        }
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      if (failure !== null) {
        throw new Error(`The frame threw while it was drawn:\n${failure}`);
      }
    };
    await settle();

    let height = probe;
    let clipped = false;
    let empty = false;
    if (options.height === undefined) {
      const node = runtime.layoutRoot().firstChild?.firstChild ?? null;
      const content = node === null ? probe : Math.ceil(runtime.debugLayoutBox(node).height);
      clipped = content > probe;
      empty = content === 0;
      height = Math.max(1, Math.min(content, probe));
      runtime.resize(width, height, scale);
      await settle();
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return { png: new Uint8Array(await blob.arrayBuffer()), width, height, clipped, empty, errors };
  } finally {
    runtime.dispose();
    // RxJS rethrows what a subscriber did not catch from a timer, so an
    // error from the last frame, or from taking the tree down, arrives
    // after this would otherwise have stopped listening.
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    scope.removeEventListener?.('error', uncaught);
    scope.removeEventListener?.('unhandledrejection', uncaught);
  }
}
