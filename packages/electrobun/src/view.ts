/**
 * The webview's half of the bridge.
 *
 * A Gesso render worker opens a named port per channel and expects the
 * application layer at the other end of it. In a desktop window the
 * application layer is in another process, reachable only from this
 * thread, so this stands in its place: it accepts the handshakes the
 * render worker sends and pumps each one over Electrobun's RPC as a
 * numbered stream.
 *
 * It is a transport and nothing else. It serializes a message it never
 * inspects, and it holds no channel, no token and no patch. Anything
 * that needs to understand a payload to route it belongs on the other
 * side of the bridge, and if that ever changes here, the wrong thing
 * is happening on the thread that must stay free for input.
 */
import { isHubMessage, isPortHandshake, type AppLogicEndpoint } from '@gesso/framework';

import { DEFAULT_CHUNK_BYTES, FrameAssembler, frameData, type GessoFrame } from './frames';

export interface ElectrobunBridgeOptions {
  /**
   * Sends one frame to the main process, which is
   * `view.rpc.send.<name>` for whichever message name the application
   * declared. A function rather than the RPC object, so this package
   * imports nothing from Electrobun's SDK and can be specified without
   * a window.
   */
  send: (frame: GessoFrame) => void;
  /** Overrides `DEFAULT_CHUNK_BYTES`. Only a test should need to. */
  chunkBytes?: number;
}

export interface ElectrobunBridge {
  /**
   * Hand this to the shell as its application layer:
   *
   *   createApp({ renderWorker: …, appLogicWorker: bridge.endpoint })
   *
   * The shell wires it exactly as it wires a worker it was handed, and
   * never closes it.
   */
  readonly endpoint: AppLogicEndpoint;
  /** Call from the RPC handler that receives frames from the main process. */
  receive(frame: GessoFrame): void;
  /** Closes every stream and stops pumping. */
  dispose(): void;
}

export function createElectrobunBridge(options: ElectrobunBridgeOptions): ElectrobunBridge {
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
    receive(frame: GessoFrame): void {
      if (disposed) {
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
        throw new Error(`The main process opened stream ${frame.stream}, which only the window may do.`);
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
