import { describe, expect, it } from 'vitest';

import { ShellService, type ShellRequest } from './ShellService';

/**
 * `warnOnLeave` is a state, not an event: the shell should hear each
 * change once, and a shell that arrives after it was turned on should
 * still be told, or a page reloaded mid-edit would leave without asking.
 */
describe('ShellService.warnOnLeave', () => {
  it('tells the shell of each change, once', () => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    service.warnOnLeave(true);
    service.warnOnLeave(true);
    service.warnOnLeave(false);
    service.warnOnLeave(false);
    expect(requests).toEqual([
      { type: 'leaveWarning', on: true },
      { type: 'leaveWarning', on: false }
    ]);
  });

  it('tells a shell that arrives after the warning was turned on', () => {
    const service = new ShellService();
    service.warnOnLeave(true);
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    expect(requests).toEqual([{ type: 'leaveWarning', on: true }]);
  });

  it('tells a shell nothing when there is nothing to lose', () => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    expect(requests).toEqual([]);
  });
});
