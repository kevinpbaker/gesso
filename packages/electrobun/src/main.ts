/**
 * The main process's half of the bridge.
 *
 * `serveChannels` publishes an application's channels over a handshake
 * that arrives on a worker's global scope with a `MessagePort`
 * attached. No process boundary outside a worker can carry a port, so
 * this synthesises both: an `open` frame becomes the handshake, and
 * the port it hands over writes back as frames on the same stream.
 *
 * Nothing in `serveChannels`, `provide` or a view model changes for
 * this. That is the point of the seam: the application layer does not
 * learn it is talking to a window instead of a page.
 */
import { serveChannels, type PortHost, type ServedChannel } from '@gesso/framework';

import { DEFAULT_CHUNK_BYTES, FrameAssembler, frameControl, frameData, type GessoFrame } from './frames';

export interface ChannelHostOptions {
  /**
   * Sends one frame to the window, which is
   * `window.webview.rpc.send.<name>`. One host per window: each keeps
   * its own streams, and `provide` already keeps a separate record of
   * what each client has seen, so two windows agree without anything
   * here arranging it.
   */
  send: (frame: GessoFrame) => void;
  /** Overrides `DEFAULT_CHUNK_BYTES`. Only a test should need to. */
  chunkBytes?: number;
  /**
   * A url the window asked to have opened outside itself.
   *
   * `Utils.openExternal(url)` is what an Electrobun application passes
   * here. It is not called for the application: opening something is
   * an act, and which urls an application is willing to hand to the
   * operating system is the application's decision.
   */
  onOpenUrl?: (url: string) => void;
}

export interface ChannelHost {
  /** Call from the RPC handler that receives frames from the window. */
  receive(frame: GessoFrame): void;
  /** Tells the window which appearance the platform is in. */
  setColorScheme(scheme: 'light' | 'dark'): void;
  /** Stops serving and disposes every channel this host provided. */
  dispose(): void;
}

/**
 * Serves an application's channels to one window.
 *
 *   const host = serveChannelsToWindow(
 *     [{ token: Catalogue, source: { view: { … }, commands: { … } } }],
 *     { send: frame => window.webview.rpc.send.gessoFrame(frame) }
 *   );
 */
export function serveChannelsToWindow(channels: readonly ServedChannel[], options: ChannelHostOptions): ChannelHost {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const assembler = new FrameAssembler();
  /** The synthetic port each stream is served through. */
  const ports = new Map<number, StreamPort>();

  // `servePorts` installs its chain on this and answers handshakes
  // delivered through `onmessage`. It is the whole of the shim: a
  // worker's global scope, as far as anything downstream can tell.
  const host: PortHost = { onmessage: null };
  const stop = serveChannels(channels, host);

  return {
    setColorScheme(scheme: 'light' | 'dark'): void {
      options.send(frameControl('colorScheme', { scheme }));
    },
    receive(frame: GessoFrame): void {
      if (frame.kind === 'control') {
        if (frame.name === 'openUrl') {
          const payload = JSON.parse(frame.body) as { url?: string };
          if (typeof payload.url === 'string') {
            options.onOpenUrl?.(payload.url);
          }
        }
        return;
      }
      if (frame.kind === 'open') {
        const port = new StreamPort(frame.stream, options.send, chunkBytes);
        ports.set(frame.stream, port);
        host.onmessage?.({
          data: { type: 'gesso:port', key: frame.name },
          // A `StreamPort` is a `MessagePort` in the two ways anything
          // downstream uses one, and in no others. The cast is the
          // seam; widening `PortHost` to admit a structural port would
          // widen it for every worker as well.
          ports: [port as unknown as MessagePort]
        });
        return;
      }
      if (frame.kind === 'close') {
        assembler.forget(frame.stream);
        ports.delete(frame.stream);
        return;
      }
      const value = assembler.take(frame);
      if (value === undefined) {
        return;
      }
      const port = ports.get(frame.stream);
      if (port === undefined) {
        throw new Error(
          `A frame arrived for stream ${frame.stream}, which was never opened. The window and the main process disagree about what is running.`
        );
      }
      port.deliver(value);
    },
    dispose(): void {
      for (const stream of ports.keys()) {
        options.send({ kind: 'close', stream });
      }
      ports.clear();
      stop();
      host.onmessage = null;
    }
  };
}

/**
 * One channel's port, as the application layer sees it.
 *
 * `provide` sets `onmessage` and calls `postMessage`, and that is the
 * entire surface it uses, which is why a channel can be served over
 * something that is not a `MessagePort` at all.
 */
class StreamPort {
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(
    private readonly stream: number,
    private readonly send: (frame: GessoFrame) => void,
    private readonly chunkBytes: number
  ) {}

  postMessage(value: unknown): void {
    for (const frame of frameData(this.stream, value, this.chunkBytes)) {
      this.send(frame);
    }
  }

  deliver(value: unknown): void {
    this.onmessage?.({ data: value });
  }

  /** `provide` closes a port it is done with; there is nothing to close. */
  close(): void {}
}
