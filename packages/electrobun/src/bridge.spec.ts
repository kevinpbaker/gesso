/**
 * The bridge end to end, in one process.
 *
 * A channel is served the way an application serves one in the main
 * process, a replica is built the way the render worker builds one,
 * and between them are the two pumps joined by a fake RPC pair that
 * does what Electrobun's does: carries a frame, in order, one way.
 *
 * Nothing here mocks the channel layer. If `provide` or the handshake
 * changes shape, this fails, which is the point.
 */
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { channel, ChannelReplica, portHandle, type ChannelPort, type ServedChannel } from 'gesso-framework';

import type { GessoFrame } from './frames';
import { serveChannelsToWindow, type ChannelHost } from './main';
import { createElectrobunBridge, type ElectrobunBridge } from './view';

interface CatalogueView {
  title: string;
  items: string[];
}

interface CatalogueCommands {
  add: (item: string) => void;
}

const Catalogue = channel<CatalogueView, CatalogueCommands>('catalogue', { title: '', items: [] });

/**
 * A record of what crossed, in order.
 *
 * Delivery itself is synchronous in the `send` callbacks below, which
 * is stricter than the real transport rather than looser: a frame is
 * handed over the moment it is produced, so nothing here can pass by
 * relying on a queue settling.
 */
function rpcPair(): { toWindow: GessoFrame[]; toMain: GessoFrame[] } {
  return { toWindow: [], toMain: [] };
}

describe('the bridge, end to end', () => {
  let items: BehaviorSubject<string[]>;
  let title: BehaviorSubject<string>;
  let added: string[];
  let served: ServedChannel[];

  beforeEach(() => {
    items = new BehaviorSubject<string[]>(['first']);
    title = new BehaviorSubject<string>('Catalogue');
    added = [];
    served = [
      {
        token: Catalogue,
        source: {
          view: { title, items },
          commands: {
            add: (item: string) => {
              added.push(item);
              items.next([...items.value, item]);
            }
          }
        }
      }
    ];
  });

  /**
   * Stands the whole thing up: a host in "the main process", a bridge
   * in "the window", the shell's hub handshake, and a replica in "the
   * render worker".
   */
  async function stand(chunkBytes?: number): Promise<{
    replica: ChannelReplica<CatalogueView, CatalogueCommands>;
    settle: () => Promise<void>;
    frames: { toWindow: GessoFrame[]; toMain: GessoFrame[] };
    host: ChannelHost;
    bridge: ElectrobunBridge;
  }> {
    const pair = rpcPair();
    let host!: ChannelHost;
    let bridge!: ElectrobunBridge;
    bridge = createElectrobunBridge({
      send: frame => {
        pair.toMain.push(frame);
        host.receive(frame);
      },
      chunkBytes
    });
    host = serveChannelsToWindow(served, {
      send: frame => {
        pair.toWindow.push(frame);
        bridge.receive(frame);
      },
      chunkBytes
    });

    // The shell's half: it posts the hub handshake to whatever it was
    // given as an application layer, exactly as `WorkerApp` does.
    const hub = new MessageChannel();
    bridge.endpoint.postMessage({ type: 'gesso:hub' }, [hub.port2]);

    // The render worker's half: it opens a named port on the hub and
    // builds a replica over it.
    const handle = portHandle(hub.port1);
    // The same cast `createChannelRegistry` makes: a `MessagePort` is a
    // `ChannelPort`, and only the DOM's `this`-typed `onmessage` says otherwise.
    const replica = new ChannelReplica(Catalogue, handle.open(Catalogue.name) as unknown as ChannelPort);

    const settle = async (): Promise<void> => {
      for (let turn = 0; turn < 20; turn++) {
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };
    await settle();
    return { replica, settle, frames: pair, host, bridge };
  }

  it('replicates a channel from the main process into the window', async () => {
    const { replica, settle } = await stand();
    expect(replica.view.title.value).toBe('Catalogue');
    expect(replica.view.items.value).toEqual(['first']);

    title.next('Everything');
    await settle();
    expect(replica.view.title.value).toBe('Everything');
  });

  it('carries a command back the other way', async () => {
    const { replica, settle } = await stand();
    replica.send.add('second');
    await settle();
    expect(added).toEqual(['second']);
    expect(replica.view.items.value).toEqual(['first', 'second']);
  });

  it('opens one stream per channel, named by the channel', async () => {
    const { frames } = await stand();
    const opens = frames.toMain.filter(frame => frame.kind === 'open');
    expect(opens).toEqual([{ kind: 'open', stream: 1, name: 'catalogue' }]);
  });

  it('splits a patch too large for the transport and puts it back together', async () => {
    const { replica, settle, frames } = await stand(256);
    const many = Array.from({ length: 400 }, (_, index) => `row ${index}`);
    items.next(many);
    await settle();

    const split = frames.toWindow.filter(frame => frame.kind === 'data' && frame.parts !== undefined);
    expect(split.length).toBeGreaterThan(1);
    expect(replica.view.items.value).toEqual(many);
  });

  it('serves two windows from one source, each keeping its own record', async () => {
    const first = await stand();
    const second = await stand();
    title.next('Both');
    await first.settle();
    await second.settle();
    expect(first.replica.view.title.value).toBe('Both');
    expect(second.replica.view.title.value).toBe('Both');
  });

  it('answers a channel nothing serves, through the synthetic port', async () => {
    // The shim reuses `servePorts` rather than answering handshakes
    // itself, so a misspelled channel name is as loud here as it is in
    // a worker. That answer has to come back over a stream.
    const sent: GessoFrame[] = [];
    const host = serveChannelsToWindow(served, { send: frame => sent.push(frame) });
    host.receive({ kind: 'open', stream: 9, name: 'catalog' });

    const answers = sent.filter(frame => frame.kind === 'data' && frame.stream === 9);
    expect(answers).toHaveLength(1);
    const message = JSON.parse((answers[0] as { body: string }).body) as { type: string; message: string };
    expect(message.type).toBe('port:error');
    expect(message.message).toContain("Nothing is served under 'catalog'");
    expect(message.message).toContain('catalogue');
    host.dispose();
  });

  it('stops pumping once disposed', async () => {
    const { host, bridge, settle, frames } = await stand();
    host.dispose();
    bridge.dispose();
    const before = frames.toWindow.length + frames.toMain.length;
    title.next('After the window closed');
    await settle();
    expect(frames.toWindow.length + frames.toMain.length).toBe(before);
  });
});
