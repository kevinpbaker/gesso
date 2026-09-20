import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expect, it, vi } from 'vitest';

import {
  Channel,
  channel,
  Component,
  createComponent,
  Define,
  provide,
  RenderWorkerApp,
  type ChannelReplica,
  type RuntimeToShellMessage,
  type ShellToRuntimeMessage
} from 'gesso-framework';
import { createActionLog } from './ActionLog';
import { inputLabel, tapRenderWorker, type RenderWorkerHost } from './RenderWorkerTap';

interface TickerView {
  ticks: number;
}

interface TickerCommands {
  step(by: number): void;
}

const Ticker = channel<TickerView, TickerCommands>('ticker', { ticks: 0 });

/**
 * A box, without importing `gesso-core`.
 *
 * `gesso-devtools` depends on the framework alone, and a `UiElement`
 * is plain data: core's `Box` builds exactly this object. One element
 * with a listener on it is all the tree this spec needs, and the
 * listener is the point — a command sent from it is sent inside the
 * dispatch of the click, which is what a cause is.
 */
function box(props: Record<string, unknown>): ReturnType<Component['render']> {
  return { type: 'box', props, children: [] } as unknown as ReturnType<Component['render']>;
}

/** The root the render worker builds: one pressable box over the channel. */
@Define('tap-demo')
class TickerDemo extends Component {
  @Channel(Ticker) ticker!: ChannelReplica<TickerView, TickerCommands>;

  override render() {
    return box({
      width: 400,
      height: 300,
      onClick: () => this.ticker.send.step(5),
      // Bound to the channel, so a patch dirties the tree and there is
      // a frame to be the end of the chain. A patch nothing is bound
      // to draws nothing, which is correct and would prove nothing.
      backgroundColor: this.ticker.view.ticks.pipe(map(ticks => (ticks % 2 === 0 ? '#101010' : '#202020')))
    });
  }
}

/** Enough of a canvas for the runtime to lay out and paint against. */
function mockCanvas(width = 400, height = 300) {
  const ctx: Record<string, unknown> = {};
  for (const method of [
    'save',
    'restore',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'clearRect',
    'fillRect',
    'strokeRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'arcTo',
    'closePath',
    'rect',
    'clip',
    'fill',
    'stroke',
    'fillText',
    'drawImage'
  ]) {
    ctx[method] = vi.fn();
  }
  ctx.measureText = vi.fn((text: string) => ({ width: String(text).length * 7 }));
  return { width, height, getContext: () => ctx };
}

/** Stands in for the worker global: what the shell sends, and what goes back. */
function fakeWorkerGlobal() {
  const sent: RuntimeToShellMessage[] = [];
  const host = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: unknown) => {
      sent.push(message as RuntimeToShellMessage);
    },
    addEventListener: () => {}
  };
  const send = (message: ShellToRuntimeMessage): void => {
    host.onmessage?.({ data: message });
  };
  return { host, sent, send };
}

/**
 * The application worker, as the shell hands it over.
 *
 * `portHandle` posts a handshake with a real `MessagePort` attached,
 * so this end is served exactly as an application worker's
 * `servePorts` would serve it: the channel is provided over the port
 * that arrives.
 */
function fakeApplicationWorker(ticks: BehaviorSubject<number>) {
  const opened: string[] = [];
  return {
    opened,
    endpoint: {
      postMessage: (message: unknown, transfer: Transferable[]): void => {
        const key = (message as { key?: string }).key;
        const port = transfer[0] as MessagePort;
        if (key === undefined || port === undefined) {
          return;
        }
        opened.push(key);
        provide(
          Ticker,
          { view: { ticks }, commands: { step: (by: number) => ticks.next(ticks.value + by) } },
          port as unknown as {
            postMessage(message: unknown): void;
            onmessage: ((event: { data: unknown }) => void) | null;
          }
        );
      }
    }
  };
}

const noKeyModifiers = { shift: false, ctrl: false, alt: false, meta: false };

function initMessage(canvas: unknown, appPort: unknown): ShellToRuntimeMessage {
  return {
    type: 'init',
    canvas: canvas as OffscreenCanvas,
    width: 400,
    height: 300,
    dpr: 1,
    appPort: appPort as MessagePort
  };
}

describe('the render worker tap', () => {
  it('opens a tapped channel over the port the shell sends with init', async () => {
    const { host, send } = fakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(TickerDemo), host as never);
    const log = createActionLog();
    const tap = tapRenderWorker(log, { host: host as unknown as RenderWorkerHost });
    app.useChannel(Ticker, { worker: tap.applicationWorker([Ticker]) });
    // Not the token's initial, so the provider's answer to the new
    // client is a real patch rather than an empty diff.
    const ticks = new BehaviorSubject(7);
    const worker = fakeApplicationWorker(ticks);

    send(initMessage(mockCanvas(), worker.endpoint));

    expect(worker.opened).toEqual(['ticker']);
    // The provider answers a new client with its whole state, which is
    // the first thing the timeline should show.
    await vi.waitFor(() => {
      expect(log.entries.some(entry => entry.kind === 'patch' && entry.channel === 'ticker')).toBe(true);
    });
    expect(log.channels).toEqual(['ticker']);
    tap.dispose();
  });

  it('gives a command the input that caused it, and the patches that answer it', async () => {
    const { host, send } = fakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(TickerDemo), host as never);
    const log = createActionLog();
    const tap = tapRenderWorker(log, { host: host as unknown as RenderWorkerHost });
    app.useChannel(Ticker, { worker: tap.applicationWorker([Ticker]) });
    const ticks = new BehaviorSubject(0);
    send(initMessage(mockCanvas(), fakeApplicationWorker(ticks).endpoint));

    // A real press on the box, routed by the runtime to the listener
    // that sends the command, all inside this one message.
    send({ type: 'pointerDown', x: 12, y: 34, buttons: 1, modifiers: noKeyModifiers });
    send({ type: 'pointerUp', x: 12, y: 34, buttons: 0, modifiers: noKeyModifiers });

    const command = log.entries.find(entry => entry.kind === 'command');
    // The click is `pointerUp`, and the id is 1 because the
    // `pointerDown` before it sent nothing and so consumed no id.
    expect(command?.cause).toEqual({ id: 1, label: 'pointerUp (12, 34)' });
    // And the answer, which arrives a task later on a real port, is
    // tied to the same click without the protocol carrying an id.
    await vi.waitFor(() => {
      expect(ticks.value).toBe(5);
    });
    await vi.waitFor(() => {
      const answer = log.entries.find(entry => entry.kind === 'patch' && entry.cause?.id === 1);
      expect(answer).toBeDefined();
    });
    tap.dispose();
  });

  it('closes the chain with the frame that drew it, and records no frame with nothing to close', async () => {
    const { host, sent, send } = fakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(TickerDemo), host as never);
    const log = createActionLog();
    const tap = tapRenderWorker(log, { host: host as unknown as RenderWorkerHost });
    app.useChannel(Ticker, { worker: tap.applicationWorker([Ticker]) });
    send(initMessage(mockCanvas(), fakeApplicationWorker(new BehaviorSubject(0)).endpoint));
    await vi.waitFor(() => {
      expect(sent.some(message => message.type === 'frame')).toBe(true);
    });
    // Frames drawn before anything crossed a channel leave no trace.
    expect(log.entries).toEqual([]);

    send({ type: 'pointerDown', x: 12, y: 34, buttons: 1, modifiers: noKeyModifiers });
    send({ type: 'pointerUp', x: 12, y: 34, buttons: 0, modifiers: noKeyModifiers });

    await vi.waitFor(() => {
      expect(log.entries.some(entry => entry.kind === 'frame')).toBe(true);
    });
    // Click, command, patches, frame: the whole chain, in order, under
    // one cause.
    const chain = log.entries.map(entry => entry.kind);
    expect(chain).toEqual(['command', 'patch', 'frame']);
    expect(log.entries.every(entry => entry.cause?.id === 1)).toBe(true);
    const frame = log.entries.find(entry => entry.kind === 'frame');
    expect(typeof (frame as { frame: number }).frame).toBe('number');
    tap.dispose();
  });

  it('forwards each entry to the shell as a devtools event', async () => {
    const { host, sent, send } = fakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(TickerDemo), host as never);
    const log = createActionLog();
    const tap = tapRenderWorker(log, { host: host as unknown as RenderWorkerHost });
    app.useChannel(Ticker, { worker: tap.applicationWorker([Ticker]) });
    send(initMessage(mockCanvas(), fakeApplicationWorker(new BehaviorSubject(0)).endpoint));
    send({ type: 'pointerDown', x: 12, y: 34, buttons: 1, modifiers: noKeyModifiers });
    send({ type: 'pointerUp', x: 12, y: 34, buttons: 0, modifiers: noKeyModifiers });

    // The route a log in the page does not need. The shell holds
    // neither end of the channel here, so the entries reach a panel
    // the way every other answer from this thread does.
    await vi.waitFor(() => {
      const forwarded = sent.filter(
        message => message.type === 'devtools' && (message.event as { kind: string }).kind === 'action'
      );
      expect(forwarded.length).toBeGreaterThan(0);
    });
    tap.dispose();
  });

  it('leaves the global as it found it', () => {
    const { host } = fakeWorkerGlobal();
    const original = host.onmessage;
    const originalPost = host.postMessage;
    const tap = tapRenderWorker(createActionLog(), { host: host as unknown as RenderWorkerHost });

    tap.dispose();

    expect(host.onmessage).toBe(original);
    expect(host.postMessage).toBe(originalPost);
  });

  it('says a channel was opened before the shell sent its port, rather than opening one of its own', () => {
    const { host } = fakeWorkerGlobal();
    const tap = tapRenderWorker(createActionLog(), { host: host as unknown as RenderWorkerHost });

    expect(() => tap.applicationWorker([Ticker]).open('ticker')).toThrow(/before the shell sent/);
    tap.dispose();
  });
});

describe('the label an input is recorded under', () => {
  it('names the input and where it happened, and ignores what is not one', () => {
    expect(inputLabel({ type: 'pointerUp', x: 12.4, y: 33.6, buttons: 0, modifiers: noKeyModifiers })).toBe(
      'pointerUp (12, 34)'
    );
    expect(inputLabel({ type: 'keyDown', key: 'Enter', modifiers: noKeyModifiers })).toBe('keyDown Enter');
    // Lifecycle, not something a person did.
    expect(inputLabel({ type: 'tick', time: 0 })).toBeNull();
    expect(inputLabel(undefined)).toBeNull();
  });
});
