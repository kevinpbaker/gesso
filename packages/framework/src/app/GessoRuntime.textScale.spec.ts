import { describe, expect, it } from 'vitest';

import { Column, Text, type UiNode } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';
import { ShellService } from './ShellService';

/**
 * The browser's text-size setting, reaching layout. A person who asked
 * for 20 rather than 16 gets every line a quarter taller, and the
 * application can read the scale to make room.
 */
describe('GessoRuntime.setTextScale', () => {
  it('lays the text out again at the new size, and says so on ShellService', () => {
    let label: UiNode | null = null;
    const mounted = mountRuntime(
      Column({}, Text({ text: 'Hello', fontSize: 16, ref: (n: UiNode | null) => (label = n) })),
      { width: 400, height: 300 }
    );
    mounted.frame();
    const before = mounted.runtime.debugLayoutBox(label!).height;

    mounted.runtime.setTextScale(1.25);
    mounted.frame();

    expect(mounted.runtime.debugLayoutBox(label!).height).toBeCloseTo(before * 1.25);
    expect(mounted.runtime.services.get(ShellService).textScale.value).toBe(1.25);
  });

  it('ignores a scale that is not a positive number', () => {
    const mounted = mountRuntime(Column({}, Text({ text: 'Hello' })), { width: 400, height: 300 });
    mounted.runtime.setTextScale(0);
    mounted.runtime.setTextScale(Number.NaN);
    expect(mounted.runtime.services.get(ShellService).textScale.value).toBe(1);
  });
});
