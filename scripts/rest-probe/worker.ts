import { internalState, serve, serveChannels } from '../../packages/framework/src/worker/index.ts';
import { Probe, type Wire } from './Probe.ts';

/**
 * The worker half of the probe: it serves `Probe` the way an
 * application worker serves its channels, and records two things about
 * every command that reaches it.
 *
 * `calls` is what the handler was called with, which is the claim
 * made about `move(from, to)`: the arguments are
 * spread back out on this side. `wire` is the message as it arrived on
 * the port, before `provide` took it apart, which is the claim about
 * the transport: the first argument travels as `payload` and the
 * others as `rest`. The second is caught by wrapping the port's
 * handler, because the shape on the wire is otherwise invisible from
 * either end.
 */

const calls = internalState<readonly (readonly unknown[])[]>([]);
const wire = internalState<readonly Wire[]>([]);

const onmessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')!;
Object.defineProperty(MessagePort.prototype, 'onmessage', {
  configurable: true,
  get: onmessage.get,
  set(this: MessagePort, handler: ((event: MessageEvent) => void) | null) {
    onmessage.set!.call(
      this,
      handler === null
        ? null
        : (event: MessageEvent) => {
            const data = event.data as { type?: unknown } | null;
            if (data !== null && typeof data === 'object' && data.type === 'channel:command') {
              wire.value = [...wire.value, structuredClone(data) as unknown as Wire];
            }
            handler.call(this, event);
          }
    );
  }
});

serveChannels([
  serve(Probe, {
    view: { calls, wire },
    commands: {
      move: (from, to, why) => {
        calls.value = [...calls.value, [from, to, why]];
      }
    }
  })
]);
