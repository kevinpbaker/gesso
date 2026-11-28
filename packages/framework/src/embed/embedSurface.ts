import { createApp, type CreateAppOptions } from '../app/createApp';
import type { AppLogicEndpoint, WorkerApp, WorkerAppOptions } from '../app/worker/WorkerApp';
import type { ColorSchemePreference } from '../app/colorScheme';
import type { ServedChannel } from '../channel/serveChannels';
import { hostChannels } from './hostChannels';

/** What `embedSurface` takes: `createApp`'s options, with the ones an embedded app must get right made its defaults. */
export interface EmbedOptions extends Omit<CreateAppOptions, 'renderWorker'> {
  /**
   * Spawns the render worker. Required here, unlike `createApp`:
   * `gesso-vite-plugin` writes it only into a `createApp` call.
   *
   *   renderWorker: () => new Worker(new URL('./grid.render.worker.ts', import.meta.url), { type: 'module' })
   */
  renderWorker: WorkerAppOptions['renderWorker'];
  /**
   * Channels the embedding page serves from its own thread: its state
   * as their views, its callbacks as their commands. See `hostChannels`.
   * With `appLogicWorker` too, the page serves these and the worker the
   * rest.
   */
  channels?: readonly ServedChannel[];
}

/** An app mounted into part of a page. */
export interface EmbeddedSurface {
  /** The shell, for what this handle does not cover: `setInspector`, `devtools`. */
  readonly app: WorkerApp;
  /** Gives the app the keyboard, as a click on it would. */
  focus(): void;
  /** Changes the appearance the app is told about, without a remount. */
  setColorScheme(preference: ColorSchemePreference): void;
  /** Unmounts the app: stops the workers it started, removes the canvas, and stops serving `channels`. */
  dispose(): void;
}

/**
 * Mounts a Gesso app into one element of a page that is not Gesso's:
 * a grid or an editor inside an existing React, Vue or plain page.
 *
 *   const surface = embedSurface(document.getElementById('grid')!, {
 *     renderWorker: () => new Worker(new URL('./grid.render.worker.ts', import.meta.url), { type: 'module' }),
 *     channels: [serve(GridFilter, { view: { text }, commands: { open: id => router.go(id) } })]
 *   });
 *   // later
 *   surface.dispose();
 *
 * It is `createApp(...).mount(host)` with the defaults turned round for
 * an app that shares the page:
 *
 * - **The address bar stays the page's.** History is `memory` unless
 *   given; an embedded router does not push urls.
 * - **The title and the leave warning stay the page's.** They go to
 *   `onTitle` and `onLeaveWarning`, and nowhere when those are absent.
 * - **The keyboard can leave.** Tab past the last stop moves to the
 *   page's next control (`tabExit`); keys pressed elsewhere on the page
 *   are not the app's (`pageKeys` stays off).
 *
 * The app fills the host's content box and follows its size, so the
 * host must have a height of its own: a host whose height comes only
 * from its content is zero tall, since a canvas has no content height.
 */
export function embedSurface(host: HTMLElement, options: EmbedOptions): EmbeddedSurface {
  const { channels, ...rest } = options;
  let served: ReturnType<typeof hostChannels> | null = null;
  let ownedWorker: Worker | null = null;
  let appLogicWorker = rest.appLogicWorker;
  if (channels !== undefined && channels.length > 0) {
    let worker: AppLogicEndpoint | undefined;
    if (typeof appLogicWorker === 'function') {
      ownedWorker = appLogicWorker();
      worker = ownedWorker;
    } else if (typeof appLogicWorker === 'string' || appLogicWorker instanceof URL) {
      ownedWorker = new Worker(appLogicWorker, { type: 'module' });
      worker = ownedWorker;
    } else {
      worker = appLogicWorker;
    }
    served = hostChannels(channels, worker);
    appLogicWorker = served.endpoint;
  }

  const app = createApp({
    history: { mode: 'memory' },
    onTitle: () => {},
    onLeaveWarning: () => {},
    ...rest,
    tabExit: rest.tabExit ?? true,
    appLogicWorker
  });
  const unmount = app.mount(host);
  if (host.clientHeight === 0) {
    console.warn(
      '[gesso] embedSurface was given a host with no height, so the app draws nothing. A canvas has no content ' +
        'height to give it: set a height on the host (CSS height, flex or grid).'
    );
  }

  let disposed = false;
  return {
    app,
    focus: () => host.querySelector('canvas')?.focus(),
    setColorScheme: preference => app.setColorScheme(preference),
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unmount();
      served?.dispose();
      ownedWorker?.terminate();
    }
  };
}
