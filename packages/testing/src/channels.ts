import {
  createChannelRegistry,
  type ChannelRegistry,
  type ChannelReplica,
  type ChannelToken,
  type ServedChannel
} from 'gesso-framework';

/** What `serveForTest` hands back: the replicas a screen would bind to, and a way to wait for patches. */
export interface ServedForTest {
  /** The replica of one served channel, as `ctx.channel(token)` would return it. */
  get<V extends object, C extends object>(token: ChannelToken<V, C>): ChannelReplica<V, C>;
  /**
   * The registry, for `renderTest(component, { channels: served.registry })`.
   *
   * Without it there is no supported way to render a component against
   * served channels: `serveForTest` answers "did the wiring work" and
   * `renderTest` answers "what does it look like", and a screen driven
   * by a worker is exactly the case that needs both at once.
   */
  readonly registry: ChannelRegistry;
  /**
   * Waits for the patch stream to deliver. With a condition, until it
   * holds; without one, until two turns of the event loop have passed
   * with the ports drained, which is enough for a command's effect to
   * come back as a patch.
   */
  settle(until?: () => boolean, timeoutMs?: number): Promise<void>;
  /** Every error a served channel reported, in order. */
  readonly errors: readonly string[];
  dispose(): void;
}

/**
 * Serves channels the way an application worker does, over a real patch
 * stream, with no worker: the same `serveChannels` data goes in, and the
 * replicas a screen would read come out.
 *
 * This is the spec for a worker's *wiring*, which the domain classes'
 * own specs do not cover: that a command reaches its handler, that its
 * effect comes back as a patch to the right key, that a view key is
 * plain data. The domain classes stay as testable as they were; this
 * tests the lines between them and the barrier.
 *
 *   const served = serveForTest(transitionsChannels(catalogue, queue));
 *   const view = served.get(Queue);
 *   view.send.play({ playlistId: '1' });
 *   await served.settle(() => view.view.current.value !== null);
 */
export function serveForTest(channels: readonly ServedChannel[]): ServedForTest {
  const errors: string[] = [];
  const handle = createChannelRegistry(
    channels.map(served => ({ token: served.token, source: served.source })),
    (_name, message) => errors.push(message)
  );
  return {
    errors,
    registry: handle.registry,
    get: token => handle.registry.get(token),
    async settle(until, timeoutMs = 2000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      if (until === undefined) {
        for (let turn = 0; turn < 2; turn++) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return;
      }
      while (!until()) {
        if (Date.now() > deadline) {
          throw new Error(`serveForTest: timed out after ${timeoutMs} ms waiting for the condition to hold.`);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    },
    dispose: () => handle.dispose()
  };
}
