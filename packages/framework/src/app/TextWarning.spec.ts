import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, Text } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';

describe('a text that is not text', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once per node, naming the JSX rule that causes it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // What `<button>{icon$}</button>` compiles to: the Observable is the label.
    const icon$ = new BehaviorSubject<unknown>(Box({ width: 10, height: 10 }));
    const mounted = mountRuntime(Column({}, Button({ text: icon$ as unknown as string }), Text({ text: 'fine' })));
    mounted.frame();
    icon$.next(Box({ width: 12, height: 12 }));
    mounted.frame();

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('an element or object');
    expect(message).toContain('lone Observable child');
  });

  it('says nothing for strings, numbers written as strings, or nothing at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mounted = mountRuntime(Column({}, Text({ text: 'a' }), Button({}), Text({ text: new BehaviorSubject('b') })));
    mounted.frame();
    expect(warn).not.toHaveBeenCalled();
  });
});
