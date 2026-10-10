import { describe, expect, it } from 'vitest';

import { workerFailureMessage } from './WorkerApp';

/**
 * What the shell says when a worker fails before it can speak.
 *
 * Found by gesso-code turning on cross-origin isolation: the dev
 * server's 304 for a worker script cached earlier did not carry the new
 * `Cross-Origin-Embedder-Policy`, Chrome refused the script, and the
 * overlay said "the render worker failed to start: undefined", because
 * a script that never loads raises a plain `Event` with no message.
 */
describe('workerFailureMessage', () => {
  it('passes on the message and file of an exception during startup', () => {
    const event = Object.assign(new Event('error'), {
      message: 'Uncaught SyntaxError: Unexpected token',
      filename: 'http://host/worker.js'
    });

    expect(workerFailureMessage('render', event)).toBe(
      'the render worker failed to start: Uncaught SyntaxError: Unexpected token (http://host/worker.js)'
    );
  });

  it('says where to look when the script never loaded', () => {
    const message = workerFailureMessage('render', new Event('error'));

    expect(message).not.toContain('undefined');
    expect(message).toContain('its script did not load');
    expect(message).toContain('network panel');
    expect(message).toContain('Cross-Origin-Embedder-Policy');
  });

  it('names the app worker when it is the app worker', () => {
    expect(workerFailureMessage('app', new Event('error'))).toMatch(/^the app worker failed to start/);
  });
});
