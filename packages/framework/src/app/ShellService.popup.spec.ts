import { describe, expect, it } from 'vitest';

import { ShellService, type ShellRequest } from './ShellService';

/**
 * `openPopup` is the one shell request that is answered, so what these
 * pin is the answering: every call settles exactly once, and it settles
 * `false` rather than hanging when there is nothing that can open a
 * window.
 *
 * The browser rules behind the contract were measured in Chrome rather
 * than assumed, and are recorded in `docs/decisions/0069-a-window-the-shell-opens.md`.
 */
describe('ShellService.openPopup', () => {
  const collect = (): { service: ShellService; requests: ShellRequest[] } => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    return { service, requests };
  };

  it('asks the shell for a sized, named window', async () => {
    const { service, requests } = collect();
    void service.openPopup({ url: 'https://example.test/consent', name: 'oauth', width: 400, height: 500 });
    expect(requests).toEqual([
      { type: 'popup', id: 1, url: 'https://example.test/consent', name: 'oauth', width: 400, height: 500 }
    ]);
  });

  it('fills in a name and a size when the caller gives none', async () => {
    const { service, requests } = collect();
    void service.openPopup({ url: 'https://example.test/consent' });
    expect(requests[0]).toMatchObject({ name: 'gesso-popup', width: 520, height: 680 });
  });

  it('resolves with what the shell reports', async () => {
    const { service } = collect();
    const opened = service.openPopup({ url: 'https://example.test/a' });
    service.settlePopup(1, true);
    await expect(opened).resolves.toBe(true);

    const blocked = service.openPopup({ url: 'https://example.test/b' });
    service.settlePopup(2, false);
    await expect(blocked).resolves.toBe(false);
  });

  it('keeps two popups apart by id, whatever order they are answered in', async () => {
    const { service } = collect();
    const first = service.openPopup({ url: 'https://example.test/first' });
    const second = service.openPopup({ url: 'https://example.test/second' });
    service.settlePopup(2, true);
    service.settlePopup(1, false);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });

  it('resolves false at once when no shell is listening', async () => {
    const service = new ShellService();
    // A headless runtime has no handler, so there is no window to be
    // had and nothing that will ever answer; saying so immediately is
    // the only behaviour that does not hang the caller.
    await expect(service.openPopup({ url: 'https://example.test/a' })).resolves.toBe(false);
  });

  it('ignores a second answer to the same request', async () => {
    const { service } = collect();
    const opened = service.openPopup({ url: 'https://example.test/a' });
    service.settlePopup(1, true);
    // A duplicate or late reply is the shell being noisy; it must not
    // throw, and it must not change what the caller already saw.
    expect(() => service.settlePopup(1, false)).not.toThrow();
    expect(() => service.settlePopup(99, true)).not.toThrow();
    await expect(opened).resolves.toBe(true);
  });
});
