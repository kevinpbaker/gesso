import { describe, expect, it } from 'vitest';

import { showAppearance } from './appearance';
import type { BunFfi } from './awake';

/**
 * The Objective-C runtime, faked as `awake.spec.ts` fakes it: classes,
 * selectors and objects are numbers, a message is answered by its
 * selector's name, and what was sent to the main thread is recorded,
 * with what was made and released.
 */
function fakeRuntime(options: { window?: boolean; named?: boolean } = {}) {
  const names = new Map<bigint, string>();
  const ids = new Map<string, bigint>();
  let next = 1000n;
  const named = (s: string) => {
    let n = ids.get(s);
    if (n === undefined) {
      n = next++;
      ids.set(s, n);
      names.set(n, s);
    }
    return n;
  };
  const text = (b: Uint8Array) => new TextDecoder().decode(b).replace(/\0$/, '');
  const WINDOW = 1n;
  const strings = new Map<bigint, string>();
  /** AppKit's shared appearances, by name. */
  const appearances = new Map<bigint, string>();
  const live = new Set<bigint>();
  const onMain: { target: bigint; selector: string; appearance: string | null; wait: boolean }[] = [];

  const msgSend = (...args: unknown[]): unknown => {
    const [target, s, a, b, wait] = args as [bigint, bigint, unknown, unknown, unknown];
    const selector = names.get(s)!;
    switch (selector) {
      case 'respondsToSelector:':
        return target === WINDOW && options.window !== false && names.get(a as bigint) === 'setAppearance:';
      case 'alloc': {
        const o = next++;
        live.add(o);
        return o;
      }
      case 'initWithUTF8String:':
        strings.set(target, text(a as Uint8Array));
        return target;
      case 'appearanceNamed:': {
        expect(names.get(target)).toBe('class NSAppearance');
        if (options.named === false) return 0n;
        const look = next++;
        appearances.set(look, strings.get(a as bigint)!);
        return look;
      }
      case 'performSelectorOnMainThread:withObject:waitUntilDone:':
        onMain.push({
          target,
          selector: names.get(a as bigint)!,
          appearance: b === 0n ? null : appearances.get(b as bigint)!,
          wait: wait === true
        });
        return undefined;
      case 'release':
        live.delete(target);
        return 0n;
      default:
        throw new Error(`unexpected message ${selector}`);
    }
  };
  const ffi = {
    FFIType: { u64: 'u64', cstring: 'cstring', bool: 'bool', void: 'void', ptr: 'ptr' },
    dlopen: (_path: string, symbols: Record<string, unknown>) => ({
      symbols: Object.fromEntries(
        Object.keys(symbols).map(k => [
          k,
          k === 'objc_msgSend'
            ? msgSend
            : (b: Uint8Array) => named(`${k === 'objc_getClass' ? 'class ' : ''}${text(b)}`)
        ])
      )
    })
  };
  return { ffi: ffi as unknown as BunFfi, onMain, live, WINDOW };
}

describe('showAppearance', () => {
  it('sets the window’s appearance on the main thread, waiting for it: Aqua, DarkAqua, or nil for the system’s', () => {
    const rt = fakeRuntime();
    expect(showAppearance(rt.WINDOW, 'light', rt.ffi, 'darwin')).toBeNull();
    expect(showAppearance(rt.WINDOW, 'dark', rt.ffi, 'darwin')).toBeNull();
    expect(showAppearance(rt.WINDOW, 'auto', rt.ffi, 'darwin')).toBeNull();
    expect(rt.onMain).toEqual([
      { target: 1n, selector: 'setAppearance:', appearance: 'NSAppearanceNameAqua', wait: true },
      { target: 1n, selector: 'setAppearance:', appearance: 'NSAppearanceNameDarkAqua', wait: true },
      { target: 1n, selector: 'setAppearance:', appearance: null, wait: true }
    ]);
  });

  it('releases every object it made', () => {
    const rt = fakeRuntime();
    showAppearance(rt.WINDOW, 'dark', rt.ffi, 'darwin');
    expect([...rt.live]).toEqual([]);
  });

  it('takes Electrobun’s pointer as a number or a bigint', () => {
    const rt = fakeRuntime();
    expect(showAppearance(1, 'light', rt.ffi, 'darwin')).toBeNull();
    expect(rt.onMain).toHaveLength(1);
  });

  it('does nothing off macOS', () => {
    const rt = fakeRuntime();
    expect(showAppearance(rt.WINDOW, 'dark', rt.ffi, 'win32')).toBeNull();
    expect(showAppearance(rt.WINDOW, 'dark', rt.ffi, 'linux')).toBeNull();
    expect(rt.onMain).toEqual([]);
  });

  it('says why when it cannot', () => {
    expect(showAppearance(null, 'dark', fakeRuntime().ffi, 'darwin')).toMatch(/no native window yet/);
    expect(showAppearance(0, 'dark', fakeRuntime().ffi, 'darwin')).toMatch(/no native window yet/);
    expect(showAppearance(7n, 'dark', fakeRuntime().ffi, 'darwin')).toMatch(/not an NSWindow/);
    expect(showAppearance(1n, 'dark', fakeRuntime({ window: false }).ffi, 'darwin')).toMatch(/not an NSWindow/);
    const rt = fakeRuntime({ named: false });
    expect(showAppearance(1n, 'dark', rt.ffi, 'darwin')).toMatch(/no NSAppearanceNameDarkAqua/);
    expect(rt.onMain).toEqual([]);
    expect([...rt.live]).toEqual([]);
  });
});
