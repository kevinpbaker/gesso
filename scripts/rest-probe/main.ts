import { createChannelRegistry } from '../../packages/framework/src/channel/createChannelRegistry.ts';
import { Probe } from './Probe.ts';

/**
 * The page half of the probe: one channel registered against a real
 * `new Worker`, one command sent with three arguments, and what comes
 * back written where `check-rest-across-worker.ts` can read it.
 *
 * Nothing here is a fake. The registry is the one `createApp` builds,
 * the handle is `workerHandle`, the port is a `MessageChannel` whose
 * other end is transferred to the worker, and the command leaves this
 * thread the way a screen's does.
 */

interface Result {
  readonly calls: readonly (readonly unknown[])[];
  readonly wire: readonly unknown[];
  readonly errors: readonly string[];
}

const errors: string[] = [];
const handle = createChannelRegistry(
  [
    {
      token: Probe,
      worker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    }
  ],
  (name, message) => errors.push(`${name}: ${message}`)
);
const probe = handle.registry.get(Probe);

probe.send.move(2, 7, 'because the check said so');

const out = document.getElementById('out')!;
const publish = (): void => {
  const result: Result = { calls: probe.view.calls.value, wire: probe.view.wire.value, errors };
  (window as unknown as { gessoProbe: Result }).gessoProbe = result;
  out.textContent = JSON.stringify(result, null, 2);
};
publish();
setInterval(publish, 50);
