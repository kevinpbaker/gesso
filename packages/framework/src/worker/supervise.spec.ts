import { describe, expect, it } from 'vitest';

import {
  SupervisedWorker,
  isSupervisionMessage,
  superviseSelf,
  type SupervisableWorker,
  type SupervisedScope
} from './supervise';

/**
 * A worker and its global, wired to each other: what one posts, the
 * other's listeners hear, at once. `busy` holds the worker's messages,
 * as a worker in a loop would not read them.
 */
function pair() {
  const inside: {
    message: ((event: MessageEvent) => void)[];
    error: ((event: ErrorEvent) => void)[];
    unhandledrejection: ((event: PromiseRejectionEvent) => void)[];
  } = {
    message: [],
    error: [],
    unhandledrejection: []
  };
  let busy = false;
  const held: unknown[] = [];
  const fromWorker: unknown[] = [];
  const worker: SupervisableWorker & { terminated: boolean } = {
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (busy) held.push(message);
      else for (const listener of inside.message) listener({ data: message } as MessageEvent);
    },
    terminate() {
      this.terminated = true;
    }
  };
  const scope: SupervisedScope = {
    postMessage(message) {
      fromWorker.push(message);
      worker.onmessage?.({ data: message } as MessageEvent);
    },
    addEventListener(type: string, listener: (event: never) => void) {
      (inside as Record<string, ((event: never) => void)[]>)[type].push(listener);
    }
  };
  return {
    worker,
    scope,
    inside,
    fromWorker,
    setBusy(on: boolean) {
      busy = on;
      if (!on) for (const message of held.splice(0)) worker.postMessage(message);
    }
  };
}

function supervise(
  options: { onMessage?: (data: unknown) => void; onError?: (error: { message: string }) => void } = {}
) {
  const wired = pair();
  let now = 0;
  let scheduled = 0;
  const supervised = new SupervisedWorker(wired.worker, {
    ...options,
    now: () => now,
    schedule: (_check, every) => {
      scheduled = every;
      return () => (scheduled = -1);
    }
  });
  return { ...wired, supervised, tick: (ms: number) => (now += ms), scheduled: () => scheduled };
}

describe('SupervisedWorker', () => {
  it('starts, and runs once the worker says it is ready', () => {
    const { supervised, scope, scheduled } = supervise();
    const self = superviseSelf(undefined, scope);
    expect(supervised.status$.value).toEqual({ state: 'starting', message: '', stack: '' });
    expect(scheduled()).toBe(1000);
    self.ready();
    expect(supervised.state).toBe('running');
  });

  it('carries the application’s messages both ways, and keeps its own out of them', () => {
    const toApp: unknown[] = [];
    const toWorker: unknown[] = [];
    const { supervised, scope, tick } = supervise({ onMessage: data => toApp.push(data) });
    superviseSelf(data => toWorker.push(data), scope);
    supervised.post({ kind: 'opened', path: 'a.ts' });
    tick(1000);
    supervised.check();
    scope.postMessage({ kind: 'problems', path: 'a.ts' });
    expect(toWorker).toEqual([{ kind: 'opened', path: 'a.ts' }]);
    expect(toApp).toEqual([{ kind: 'problems', path: 'a.ts' }]);
    expect(isSupervisionMessage({ kind: 'ping' })).toBe(false);
  });

  it('stops a worker busy too long to answer, and says why', () => {
    const { supervised, scope, worker, tick, setBusy, scheduled } = supervise();
    superviseSelf(undefined, scope).ready();
    tick(1000);
    supervised.check();
    // Answered: still running.
    tick(4000);
    supervised.check();
    expect(supervised.state).toBe('running');
    setBusy(true);
    for (let i = 0; i < 6; i++) {
      tick(1000);
      supervised.check();
    }
    expect(supervised.status$.value).toEqual({
      state: 'stopped',
      message: 'It was busy for 5 seconds without answering.',
      stack: ''
    });
    expect(worker.terminated).toBe(true);
    expect(scheduled()).toBe(-1);
  });

  it('fails a worker that does not say it is ready in time, though it answers', () => {
    const { supervised, scope, tick } = supervise();
    superviseSelf(undefined, scope);
    for (let i = 0; i < 11; i++) {
      tick(1000);
      supervised.check();
    }
    expect(supervised.status$.value.state).toBe('failed');
    expect(supervised.status$.value.message).toBe('It did not say it was ready within 10 seconds.');
  });

  it('fails a worker whose setup threw, with its stack, and hears what it lives through', () => {
    const errors: { message: string }[] = [];
    const first = supervise({ onError: error => errors.push(error) });
    const self = superviseSelf(undefined, first.scope);
    self.report(new TypeError('a listener threw'));
    expect(errors).toEqual([expect.objectContaining({ message: 'a listener threw' })]);
    expect(first.supervised.state).toBe('starting');
    self.failed(new Error('It exports no activate function.'));
    expect(first.supervised.status$.value).toEqual(
      expect.objectContaining({ state: 'failed', message: 'It exports no activate function.' })
    );
    expect(first.supervised.status$.value.stack).toContain('supervise.spec.ts');
    expect(first.worker.terminated).toBe(true);
    // Once ended, nothing more is sent to it or heard from it.
    first.supervised.post({ kind: 'late' });
    first.scope.postMessage({ kind: 'late' });
    expect(errors).toHaveLength(1);
  });

  it('reports what nothing in the worker caught', () => {
    const errors: { message: string }[] = [];
    const { scope, inside } = supervise({ onError: error => errors.push(error) });
    superviseSelf(undefined, scope).ready();
    for (const listener of inside.unhandledrejection)
      listener({ reason: new Error('a promise let go') } as PromiseRejectionEvent);
    for (const listener of inside.error)
      listener({ error: new Error('a timer threw'), message: 'a timer threw' } as ErrorEvent);
    expect(errors.map(error => error.message)).toEqual(['a promise let go', 'a timer threw']);
  });

  it('is stopped by the application, once', () => {
    const { supervised, worker } = supervise();
    supervised.stop();
    supervised.fail('later');
    expect(supervised.status$.value).toEqual({ state: 'stopped', message: 'Stopped.', stack: '' });
    expect(worker.terminated).toBe(true);
  });
});
