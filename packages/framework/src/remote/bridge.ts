/**
 * The page's half of a remote channel bridge.
 *
 * A Gesso render worker opens a named port per channel and expects the
 * application layer at the other end of it. When the application layer
 * lives in another process (a desktop app's main process, a server on
 * the person's machine) it is reachable only from the page's main
 * thread, so this stands in its place: it accepts the handshakes the
 * render worker sends and pumps each one as a numbered stream of frames
 * over whatever the page has to the other process. Electrobun's RPC is
 * one such thing; a WebSocket is another.
 *
 * It is a transport and nothing else. It serializes a message it never
 * inspects, and it holds no channel, no token and no patch. Anything
 * that needs to understand a payload to route it belongs on the other
 * side of the bridge, and if that ever changes here, the wrong thing
 * is happening on the thread that must stay free for input.
 */
import type { AppLogicEndpoint } from '../app/worker/WorkerApp';
import { isHubMessage, isPortHandshake } from '../worker/WorkerPorts';

import { DEFAULT_CHUNK_BYTES, FrameAssembler, frameControl, frameData, type GessoFrame } from './frames';

export interface RemoteBridgeOptions {
  /**
   * Sends one frame to the other process: `view.rpc.send.<name>` in
   * an Electrobun window, `socket.send(JSON.stringify(frame))` over a
   * WebSocket. A function rather than the transport itself, so nothing
   * here depends on one, and it can be specified without any.
   */
  send: (frame: GessoFrame) => void;
  /** Overrides `DEFAULT_CHUNK_BYTES`. Only a test should need to. */
  chunkBytes?: number;
  /**
   * The appearance the platform is in, as the other process reports it.
   *
   * Wire it to `app.setColorScheme`. It exists because
   * `prefers-color-scheme` is not to be trusted in every webview: on
   * WebKitGTK it reported light on a desktop that was in dark mode,
   * and a shell that believes it is a browser gets the appearance
   * wrong there. A browser tab can leave it out.
   */
  onColorScheme?: (scheme: 'light' | 'dark') => void;
}

export interface RemoteBridge {
  /**
   * Hand this to the shell as its application layer:
   *
   *   createApp({ renderWorker: …, appLogicWorker: bridge.endpoint })
   *
   * The shell wires it exactly as it wires a worker it was handed, and
   * never closes it.
   */
  readonly endpoint: AppLogicEndpoint;
  /** Call with each frame that arrives from the other process. */
  receive(frame: GessoFrame): void;
  /**
   * Hands a url to the other process to open outside the page.
   *
   * Pass it as `onOpenUrl` to the shell: `window.open` in a webview
   * opens another webview or nothing at all, and a link in a desktop
   * application belongs in the person's browser.
   */
  openUrl(url: string): void;
  /**
   * Asks the other process to open this application at one of its own
   * urls somewhere new: a new window, in a desktop application.
   *
   * Pass it as `onOpenRoute` to the shell. It is what a Cmd-click on an
   * in-app link means in a desktop application: a window has no tabs,
   * and a `window.open` here would open a bare webview the application
   * does not serve. `createDesktopApp` opens the window, at that route,
   * unless the application said otherwise.
   */
  openRoute(url: string): void;
  /** Closes every stream and stops pumping. */
  dispose(): void;
}

export function createRemoteBridge(options: RemoteBridgeOptions): RemoteBridge {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const assembler = new FrameAssembler();
  /** The render worker's port for each stream this side opened. */
  const ports = new Map<number, MessagePort>();
  let hub: MessagePort | null = null;
  let nextStream = 1;
  let disposed = false;

  const openStream = (name: string, port: MessagePort): void => {
    const stream = nextStream++;
    ports.set(stream, port);
    port.onmessage = event => {
      for (const frame of frameData(stream, event.data, chunkBytes)) {
        options.send(frame);
      }
    };
    port.start?.();
    options.send({ kind: 'open', stream, name });
  };

  const endpoint: AppLogicEndpoint = {
    postMessage(message: unknown, transfer?: Transferable[]): void {
      if (disposed) {
        return;
      }
      if (isHubMessage(message)) {
        const port = transfer?.[0] as MessagePort | undefined;
        if (port === undefined) {
          throw new Error('The shell sent a hub message with no port attached.');
        }
        hub = port;
        hub.onmessage = event => {
          if (!isPortHandshake(event.data)) {
            return;
          }
          const handshake = event.ports?.[0];
          if (handshake === undefined) {
            throw new Error(`Port handshake for '${event.data.key}' arrived with no port attached.`);
          }
          openStream(event.data.key, handshake);
        };
        hub.start?.();
        return;
      }
      // Everything else the shell sends an application worker is about
      // a worker in this page: console forwarding, today. The
      // application process's console is its own, and reaching it is
      // E1.2's business rather than the transport's.
    },
    addEventListener(): void {
      // The shell listens here for console entries from the
      // application worker. There is no worker, and nothing on the
      // other side of the bridge speaks that protocol yet, so a
      // listener would never be called and is not kept.
    },
    removeEventListener(): void {}
  };

  return {
    endpoint,
    openUrl(url: string): void {
      if (!disposed) {
        options.send(frameControl('openUrl', { url }));
      }
    },
    openRoute(url: string): void {
      if (!disposed) {
        options.send(frameControl('openRoute', { url }));
      }
    },
    receive(frame: GessoFrame): void {
      if (disposed) {
        return;
      }
      if (frame.kind === 'control') {
        if (frame.name === 'colorScheme') {
          const payload = JSON.parse(frame.body) as { scheme?: 'light' | 'dark' };
          if (payload.scheme !== undefined) {
            options.onColorScheme?.(payload.scheme);
          }
        }
        // An unknown control name is ignored rather than thrown on: the
        // other process may be newer than the page, which is ordinary
        // during a hot reload.
        return;
      }
      if (frame.kind === 'close') {
        assembler.forget(frame.stream);
        ports.get(frame.stream)?.close();
        ports.delete(frame.stream);
        return;
      }
      if (frame.kind !== 'data') {
        // `open` is this side's word. One arriving from the main
        // process means the two ends disagree about who starts a
        // stream, which is worth hearing about rather than ignoring.
        throw new Error(`The other process opened stream ${frame.stream}, which only the page may do.`);
      }
      const value = assembler.take(frame);
      if (value === undefined) {
        return;
      }
      const port = ports.get(frame.stream);
      if (port === undefined) {
        // A frame for a stream this side has closed. Ordinary during
        // teardown, because the far end may already have sent.
        return;
      }
      port.postMessage(value);
    },
    dispose(): void {
      disposed = true;
      for (const [stream, port] of ports) {
        options.send({ kind: 'close', stream });
        port.close();
      }
      ports.clear();
      if (hub !== null) {
        hub.onmessage = null;
        hub.close();
        hub = null;
      }
    }
  };
}
