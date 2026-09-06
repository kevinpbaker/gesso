import {
  markNow,
  measureSpan,
  performanceMarksEnabled,
  portHandle,
  type ChannelPort,
  type ShellToRuntimeMessage,
  type WorkerHandle
} from '@gesso/framework';
import { forwardNewEntries, type ActionLog, type ActionLogToken } from './ActionLog';

/**
 * The action log in the worker configuration, and the click at the
 * head of every chain it records (`EXCELLENCE_ROADMAP.md` X15).
 *
 * `decisions/0047` recorded the gap and the reason for it. A channel's
 * ports are made where the replicas are, which in the worker
 * configuration is the render worker; the shell holds neither end and
 * never sees a patch, deliberately. So the recorder was written to run
 * in a worker — it imports no DOM and its entries are plain data — and
 * then nothing ran it there, because the two ways to wire it up were
 * "one line in the render worker's entry" and "route every patch
 * through the main thread", and the second would falsify the very
 * thing the route exists to show.
 *
 * This is that one line, made general. It stands on the wire the way
 * the recorder itself does, which is the rule `0047` set: **the tap
 * goes where the messages already are, never somewhere new.** In a
 * render worker three kinds of message go past one object, the
 * worker's global:
 *
 *   - the shell's port to the application worker, which arrives with
 *     `init` and is what a tapped channel has to be opened over;
 *   - every input the shell forwards, which is where a cause begins;
 *   - every frame the runtime reports, which is where one ends.
 *
 * Nothing here reaches into the runtime, and nothing in the framework
 * knows it exists. Used after `renderRoot`, whose constructor installs
 * the handler this wraps:
 *
 *   const app = renderRoot(AppRoot).useService(Counter);
 *   const actions = createActionLog();
 *   const tap = tapRenderWorker(actions);
 *   const data = tap.applicationWorker([Catalog, Cart]);
 *   app.useChannel(Catalog, { worker: data }).useChannel(Cart, { worker: data });
 *
 * Guard it with `import.meta.env.DEV` or the equivalent: a tap in a
 * production bundle is a recorder holding patch batches for a session
 * nobody is watching.
 */

/** The worker global, as far as the tap is concerned. */
export interface RenderWorkerHost {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export interface RenderWorkerTapOptions {
  /** Where to stand. Default: the worker's own global. */
  readonly host?: RenderWorkerHost;
  /**
   * Whether entries are posted to the shell as devtools events, so a
   * panel outside the page shows them. Default true.
   *
   * The route a log in the page does not need: there the devtools hook
   * has the log itself to read.
   */
  readonly forward?: boolean;
}

export interface RenderWorkerTap {
  /**
   * A handle on the application worker the shell supplied, with every
   * channel opened over it recorded.
   *
   * Registrations run before `init` and the shell's port arrives with
   * it, which is why this is a handle rather than a port: it is opened
   * when the runtime starts, by which time the port is here. Passing
   * it to `useChannel` is what replaces the `APPLICATION_WORKER`
   * placeholder the render worker would otherwise swap in.
   */
  applicationWorker(tokens: readonly ActionLogToken[]): WorkerHandle;
  dispose(): void;
}

export function tapRenderWorker(log: ActionLog, options: RenderWorkerTapOptions = {}): RenderWorkerTap {
  const host = options.host ?? (globalThis as unknown as RenderWorkerHost);
  const previousOnMessage = host.onmessage;
  // Kept twice over: bound, to call, since the worker global's own
  // `postMessage` needs its receiver; and unbound, to put back, so
  // dispose leaves the property the function it found rather than a
  // wrapper of it.
  const originalPostMessage = host.postMessage;
  const previousPostMessage = originalPostMessage.bind(host);
  let application: WorkerHandle | undefined;
  let disposed = false;

  host.onmessage = event => {
    const message = event.data as ShellToRuntimeMessage | undefined;
    if (message?.type === 'init' && message.appPort !== undefined) {
      // The shell's end of the hub to the application worker. Held as
      // a handle, not used: a tap that opened a port of its own would
      // be a second conversation, and the point is to be in the middle
      // of the one that was going to happen anyway.
      application = portHandle(message.appPort);
    }
    const label = inputLabel(message);
    if (label === null) {
      previousOnMessage?.(event);
      return;
    }
    // The one moment a cause is known rather than inferred: a click's
    // listener runs inside this call, and the command it sends is sent
    // before it returns.
    const close = log.cause(label);
    const measuring = performanceMarksEnabled();
    const started = measuring ? markNow() : 0;
    try {
      previousOnMessage?.(event);
    } finally {
      close();
      if (measuring) {
        measureSpan(`input ${label}`, started, markNow());
      }
    }
  };

  host.postMessage = (message: unknown, transfer?: Transferable[]): void => {
    const frame = (message as { type?: unknown; frame?: unknown } | null)?.type === 'frame';
    if (frame && typeof (message as { frame: unknown }).frame === 'number') {
      // Posted at the end of the frame, so everything this frame drew
      // has already been recorded and the entry closes them.
      log.frame((message as { frame: number }).frame);
    }
    if (transfer === undefined) {
      previousPostMessage(message);
      return;
    }
    previousPostMessage(message, transfer);
  };

  const stopForwarding =
    options.forward === false
      ? () => {}
      : forwardNewEntries(log, entry => {
          previousPostMessage({ type: 'devtools', event: { kind: 'action', entry } });
        });

  return {
    applicationWorker(tokens) {
      return {
        open(key: string): MessagePort {
          if (application === undefined) {
            throw new Error(
              `Channel '${key}' was opened before the shell sent its application worker port. ` +
                'tapRenderWorker must be called before renderRoot handles `init`, and the shell must ' +
                'have been given an appLogicWorker.'
            );
          }
          const real = application.open(key);
          const token = tokens.find(candidate => candidate.name === key);
          if (token === undefined) {
            // Untapped rather than refused: a channel the caller did
            // not name still has to work, and a missing token would
            // make the log's reconstruction wrong rather than absent.
            return real;
          }
          // `tapPort` rather than `tap`, and the difference decides
          // whether a cause is exact. `tap` puts a relay
          // `MessageChannel` between the replica and the recorder, so
          // a command crosses it a task later, by which time the click
          // that sent it has been dispatched and the cause closed.
          // `tapPort` hands the replica a port whose `postMessage` is
          // a function call, so the command is recorded inside the
          // listener that sent it. The real port to the application
          // worker is still a real port, and everything crossing a
          // thread still crosses it.
          //
          // The cast is safe for the one consumer there is: the
          // channel registry takes what `open` returns and uses it as
          // a `ChannelPort`, and nothing transfers it.
          return log.tapPort(real as unknown as ChannelPort, token) as unknown as MessagePort;
        },
        get spawned(): boolean {
          return application !== undefined;
        },
        terminate(): void {
          // The shell owns that worker's lifetime, as `portHandle`
          // says; a tap in the middle owns even less of it.
        }
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopForwarding();
      host.onmessage = previousOnMessage;
      host.postMessage = originalPostMessage;
    }
  };
}

/**
 * What to call the cause an input starts, or null for a message that
 * is not an input.
 *
 * Position is in the label because two presses in different places are
 * two different causes to the person who made them, and the ids alone
 * do not say which was which.
 */
export function inputLabel(message: ShellToRuntimeMessage | undefined): string | null {
  switch (message?.type) {
    case 'pointerDown':
    case 'pointerUp':
    case 'pointerMove':
      return `${message.type} (${Math.round(message.x)}, ${Math.round(message.y)})`;
    case 'pointerCancel':
      return 'pointerCancel';
    case 'wheel':
      return `wheel (${Math.round(message.deltaX)}, ${Math.round(message.deltaY)})`;
    case 'keyDown':
      return `keyDown ${message.key}`;
    case 'keyUp':
      return `keyUp ${message.key}`;
    case 'beforeInput':
      return `beforeInput ${message.inputType}`;
    case 'paste':
      return 'paste';
    case 'semanticsAction':
      return `semantics ${message.action.action}`;
    default:
      // Everything else the shell sends is lifecycle, not input:
      // a resize, a tick, a visibility change. None of them is
      // something a person did.
      return null;
  }
}
