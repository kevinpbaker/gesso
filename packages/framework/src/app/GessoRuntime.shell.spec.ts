import { describe, expect, it } from 'vitest';

import { Text } from 'gesso-core';
import type { ComponentContext } from '../FunctionComponent';
import { createComponent } from '../createComponent';
import { ShellService, type ShellRequest, type ShellStorageResult } from './ShellService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * A shell request made before there is a shell to hear it.
 *
 * The root is built in the runtime's constructor, so a component that
 * reads a stored preference as it mounts asks before `onShellRequest`
 * can have been called. The request used to be dropped — and a storage
 * request is a promise waiting for its answer, so the component waited
 * for ever and showed its default. Found by a spreadsheet whose chosen
 * status-bar figures never came back after a reload.
 */
describe('shell requests made while the root is built', () => {
  function Reader(_props: Record<string, never>, ctx: ComponentContext) {
    const shell = ctx.inject(ShellService);
    const answered: ShellStorageResult[] = [];
    void shell.requestStorage({ op: 'read', key: 'app:choice' }).then(result => answered.push(result));
    (globalThis as { __answered?: ShellStorageResult[] }).__answered = answered;
    return Text({ text: 'reader' });
  }

  it('are held, and handed to the listener when it attaches', async () => {
    const heard: ShellRequest[] = [];
    const { runtime } = mountRuntime(createComponent(Reader, {}), {
      onCreate: created =>
        created.onShellRequest(request => {
          heard.push(request);
          if (request.type === 'storage') {
            created.services
              .get(ShellService)
              .settleStorage(request.id, { outcome: 'ok', value: '"kept"', keys: [], error: null });
          }
        })
    });
    await Promise.resolve();

    expect(heard.map(request => request.type)).toEqual(['storage']);
    expect((globalThis as { __answered?: ShellStorageResult[] }).__answered).toEqual([
      { outcome: 'ok', value: '"kept"', keys: [], error: null }
    ]);
    runtime.dispose();
  });

  it('go straight to a listener that is already there', () => {
    const heard: ShellRequest[] = [];
    const { runtime } = mountRuntime(Text({ text: 'x' }), {
      onCreate: created => created.onShellRequest(request => heard.push(request))
    });
    runtime.services.get(ShellService).copyText('now');
    expect(heard).toEqual([{ type: 'clipboard', id: 1, text: 'now' }]);
    runtime.dispose();
  });
});
