import { describe, expect, it } from 'vitest';

import { keepRunningWhenCovered, type BunFfi } from './awake';

/**
 * The Objective-C runtime, faked: classes and selectors are numbered,
 * objects are numbered, and a message is answered by its selector's
 * name. Records what was sent where, and what was made and released.
 */
function fakeRuntime(options: { webView?: boolean; setter?: boolean; keepsOn?: boolean } = {}) {
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
  const IMPL = 1n;
  const WEB = 2n;
  const strings = new Map<bigint, string>();
  const dicts = new Map<bigint, Record<string, string>>();
  const live = new Set<bigint>();
  let occlusion = true;
  const onMain: { target: bigint; selector: string; values: Record<string, string>; wait: boolean }[] = [];

  const msgSend = (...args: unknown[]): unknown => {
    const [target, s, a, b, n] = args as [bigint, bigint, unknown, unknown, unknown];
    const selector = names.get(s)!;
    switch (selector) {
      case 'respondsToSelector:': {
        const asked = names.get(a as bigint)!;
        if (target === IMPL) return asked === 'webView';
        if (target === WEB)
          return (
            options.setter !== false &&
            (asked === '_setWindowOcclusionDetectionEnabled:' || asked === '_windowOcclusionDetectionEnabled')
          );
        return false;
      }
      case 'webView':
        return options.webView === false ? 0n : WEB;
      case 'alloc': {
        const o = next++;
        live.add(o);
        return o;
      }
      case 'initWithUTF8String:':
        strings.set(target, text(a as Uint8Array));
        return target;
      case 'initWithObjects:forKeys:count:': {
        const vals = [...(a as BigUint64Array)];
        const keys = [...(b as BigUint64Array)];
        expect(Number(n)).toBe(keys.length);
        dicts.set(target, Object.fromEntries(keys.map((k, i) => [strings.get(k)!, strings.get(vals[i]!)!])));
        return target;
      }
      case 'performSelectorOnMainThread:withObject:waitUntilDone:': {
        const values = dicts.get(b as bigint)!;
        onMain.push({ target, selector: names.get(a as bigint)!, values, wait: n === true });
        if (target === WEB && !options.keepsOn && values.windowOcclusionDetectionEnabled === '0') occlusion = false;
        return undefined;
      }
      case '_windowOcclusionDetectionEnabled':
        return occlusion;
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
  return { ffi: ffi as unknown as BunFfi, onMain, live, IMPL };
}

describe('keepRunningWhenCovered', () => {
  it('turns occlusion detection off on the WKWebView, on the main thread, waiting for it', () => {
    const rt = fakeRuntime();
    expect(keepRunningWhenCovered(rt.IMPL, rt.ffi, 'darwin')).toBeNull();
    expect(rt.onMain).toEqual([
      {
        target: 2n,
        selector: 'setValuesForKeysWithDictionary:',
        values: { windowOcclusionDetectionEnabled: '0' },
        wait: true
      }
    ]);
  });

  it('releases every object it made', () => {
    const rt = fakeRuntime();
    keepRunningWhenCovered(rt.IMPL, rt.ffi, 'darwin');
    expect([...rt.live]).toEqual([]);
  });

  it('takes Electrobun’s pointer as a number or a bigint', () => {
    const rt = fakeRuntime();
    expect(keepRunningWhenCovered(1, rt.ffi, 'darwin')).toBeNull();
  });

  it('does nothing off macOS', () => {
    const rt = fakeRuntime();
    expect(keepRunningWhenCovered(rt.IMPL, rt.ffi, 'win32')).toBeNull();
    expect(keepRunningWhenCovered(rt.IMPL, rt.ffi, 'linux')).toBeNull();
    expect(rt.onMain).toEqual([]);
  });

  it('says why when it cannot', () => {
    expect(keepRunningWhenCovered(null, fakeRuntime().ffi, 'darwin')).toMatch(/once the page has loaded/);
    expect(keepRunningWhenCovered(7n, fakeRuntime().ffi, 'darwin')).toMatch(/not a WKWebViewImpl/);
    expect(keepRunningWhenCovered(1n, fakeRuntime({ webView: false }).ffi, 'darwin')).toMatch(/no WKWebView yet/);
    expect(keepRunningWhenCovered(1n, fakeRuntime({ setter: false }).ffi, 'darwin')).toMatch(/cannot be told/);
    expect(keepRunningWhenCovered(1n, fakeRuntime({ keepsOn: true }).ffi, 'darwin')).toMatch(
      /kept its occlusion detection on/
    );
  });
});
