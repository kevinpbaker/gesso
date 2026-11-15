/**
 * Keeps a window's page running while other windows cover it, on macOS.
 *
 * WebKit takes a page whose window is covered (occluded) for a hidden
 * one, and after four minutes hidden it stops the page altogether: no
 * timers, no messages. For an application an AI drives over MCP that is
 * the usual case, not an edge one. The person is in their AI app, this
 * window is behind it, and every tool call reaches a page that will not
 * run until the window is brought forward; the window, when it is,
 * shows blank until it draws again. Electrobun has no option for it.
 *
 * So this turns WebKit's occlusion detection off for the window's web
 * view (`-[WKWebView _setWindowOcclusionDetectionEnabled:NO]`): a
 * covered window's page counts as visible and keeps running. A window
 * that is minimized, or an application that is hidden (⌘H), is still
 * hidden, and its page still stops after four minutes; the person sees
 * that one coming. Measured on macOS 27 (WebKit 22625): covered by
 * another application's window for nine minutes, a tool call a minute
 * answered in under 25 ms; without this, none answered after the
 * fourth. WebKit's documented `inactiveSchedulingPolicy` (`.none`) and
 * its hidden-page timer and process throttles were tried as well, and
 * none of them stops the page stopping.
 *
 * It goes through the Objective-C runtime with `bun:ffi`, which this
 * package does not import (it is not Bun's alone): pass the module.
 * WebKit must be changed on the main thread and Bun's JavaScript is not
 * on it, so the change is sent there with
 * `performSelectorOnMainThread:withObject:waitUntilDone:`, as
 * `setValuesForKeysWithDictionary:` (Key-value coding finds the private
 * setter by its underscore). Call it once the page has loaded, since the
 * WKWebView does not exist when the window is made:
 *
 *   import * as ffi from 'bun:ffi';
 *   window.webview.on('dom-ready', () => {
 *     const why = keepRunningWhenCovered(window.webview.ptr, ffi);
 *     if (why !== null) console.warn(`The window may stop while covered: ${why}`);
 *   });
 *
 * Two things about the FFI that cost a crash each to learn. Objects are
 * carried as u64, never as `ptr`: a small object (a short NSString, an
 * NSNumber) is a tagged pointer with its high bits set, which a
 * JavaScript number cannot hold exactly. And only owned objects
 * (alloc/init) are made: an autoreleased one is freed as soon as the
 * FFI call that made it returns.
 *
 * @param view Electrobun's pointer to the window's web view (`window.webview.ptr`), a `WKWebViewImpl`.
 * @param ffi The `bun:ffi` module.
 * @returns null once done (and on any platform but macOS, where there is nothing to do), else why it was not.
 */
export function keepRunningWhenCovered(
  view: number | bigint | null,
  ffi: BunFfi,
  platform: string = (globalThis as { process?: { platform?: string } }).process?.platform ?? ''
): string | null {
  if (platform !== 'darwin') return null;
  if (view === null || view === 0 || view === 0n)
    return 'The web view has no native view yet: call it once the page has loaded.';
  const { dlopen, FFIType } = ffi as unknown as Ffi;
  const objc = '/usr/lib/libobjc.A.dylib';
  const id = FFIType.u64;
  // Bun binds a symbol to one signature, so the library is opened once for each objc_msgSend signature.
  const open = (args: readonly unknown[], returns: unknown) =>
    dlopen(objc, { objc_msgSend: { args, returns } }).symbols.objc_msgSend!;
  const names = dlopen(objc, {
    objc_getClass: { args: [FFIType.cstring], returns: id },
    sel_registerName: { args: [FFIType.cstring], returns: id }
  }).symbols;
  const send = open([id, id], id);
  const sendBool = open([id, id], FFIType.bool);
  const asks = open([id, id, id], FFIType.bool);
  const sendText = open([id, id, FFIType.cstring], id);
  const sendArrays = open([id, id, FFIType.ptr, FFIType.ptr, FFIType.u64], id);
  const sendOnMain = open([id, id, id, id, FFIType.bool], FFIType.void);

  const c = (s: string) => new TextEncoder().encode(`${s}\0`);
  const sel = (name: string) => BigInt(names.sel_registerName!(c(name)) as bigint);
  const cls = (name: string) => BigInt(names.objc_getClass!(c(name)) as bigint);
  const obj = (o: unknown) => BigInt(o as bigint);
  const responds = (o: bigint, name: string) => asks(o, sel('respondsToSelector:'), sel(name)) === true;
  const text = (s: string) => obj(sendText(obj(send(cls('NSString'), sel('alloc'))), sel('initWithUTF8String:'), c(s)));
  const release = (o: bigint) => void send(o, sel('release'));

  const impl = BigInt(view);
  if (!responds(impl, 'webView'))
    return 'The web view is not a WKWebViewImpl: Electrobun has changed, or it is not using WebKit.';
  const web = obj(send(impl, sel('webView')));
  if (web === 0n) return 'The web view has no WKWebView yet: call it once the page has loaded.';
  if (!responds(web, '_setWindowOcclusionDetectionEnabled:'))
    return 'This WebKit cannot be told to ignore a covered window.';

  const key = text('windowOcclusionDetectionEnabled');
  const off = text('0'); // KVC reads a BOOL with boolValue, which NSString has.
  const values = obj(
    sendArrays(
      obj(send(cls('NSDictionary'), sel('alloc'))),
      sel('initWithObjects:forKeys:count:'),
      new BigUint64Array([off]),
      new BigUint64Array([key]),
      1n
    )
  );
  sendOnMain(
    web,
    sel('performSelectorOnMainThread:withObject:waitUntilDone:'),
    sel('setValuesForKeysWithDictionary:'),
    values,
    true
  );
  [values, off, key].forEach(release);
  if (
    responds(web, '_windowOcclusionDetectionEnabled') &&
    sendBool(web, sel('_windowOcclusionDetectionEnabled')) === true
  )
    return 'WebKit kept its occlusion detection on.';
  return null;
}

/** The `bun:ffi` module, as far as a caller passing it need know. */
export interface BunFfi {
  readonly dlopen: (...args: never[]) => unknown;
  readonly FFIType: object;
}

/** What is used of it. */
interface Ffi {
  dlopen(
    path: string,
    symbols: Record<string, { args: readonly unknown[]; returns: unknown }>
  ): { symbols: Record<string, ((...args: unknown[]) => unknown) | undefined> };
  FFIType: Record<'u64' | 'cstring' | 'bool' | 'void' | 'ptr', unknown>;
}
