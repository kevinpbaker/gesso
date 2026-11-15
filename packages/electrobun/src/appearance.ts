import type { ColorSchemePreference } from 'gesso-framework';

import type { BunFfi, Ffi } from './awake';

/**
 * Draws a window's own frame, its title bar, in an appearance, on macOS.
 *
 * The page draws everything inside the window, in whatever appearance
 * its shell is asked for (`ShellService.preferColorScheme`). The frame
 * around it is AppKit's, and keeps the system's: a page asked for Light
 * sat under a dark title bar whenever macOS was dark. Electrobun has no
 * option for it, so this sets the NSWindow's `appearance`, the way
 * `keepRunningWhenCovered` reaches WebKit: Aqua for `light`, DarkAqua for
 * `dark`, and nil, which is the system's own, for `auto`.
 *
 * `createDesktopApp` calls it for each window, with the appearance that
 * window's page is asked for, when it is given `ffi` and the window's
 * `nativeWindow`. Call it yourself only for a window whose appearance
 * is not the page's.
 *
 * AppKit is changed on the main thread only, and Bun's JavaScript is
 * not on it, so `setAppearance:` is sent there with
 * `performSelectorOnMainThread:withObject:waitUntilDone:`, waiting for
 * it. The FFI rules are `keepRunningWhenCovered`'s: objects are carried
 * as u64, and the one object made here (the appearance's name) is an
 * owned one, released after. The named appearances are AppKit's own
 * shared objects, which live as long as the application.
 *
 * @param window Electrobun's pointer to the window (`BrowserWindow.ptr`), an NSWindow.
 * @param preference `light`, `dark`, or `auto` for the system's.
 * @param ffi The `bun:ffi` module.
 * @returns null once done (and on any platform but macOS, where there is nothing to do), else why it was not.
 */
export function showAppearance(
  window: number | bigint | null | undefined,
  preference: ColorSchemePreference,
  ffi: BunFfi,
  platform: string = (globalThis as { process?: { platform?: string } }).process?.platform ?? ''
): string | null {
  if (platform !== 'darwin') return null;
  if (window === null || window === undefined || window === 0 || window === 0n)
    return 'The window has no native window yet.';
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
  const sendObject = open([id, id, id], id);
  const asks = open([id, id, id], FFIType.bool);
  const sendText = open([id, id, FFIType.cstring], id);
  const sendOnMain = open([id, id, id, id, FFIType.bool], FFIType.void);

  const c = (s: string) => new TextEncoder().encode(`${s}\0`);
  const sel = (name: string) => BigInt(names.sel_registerName!(c(name)) as bigint);
  const cls = (name: string) => BigInt(names.objc_getClass!(c(name)) as bigint);
  const obj = (o: unknown) => BigInt(o as bigint);

  const nsWindow = BigInt(window);
  if (asks(nsWindow, sel('respondsToSelector:'), sel('setAppearance:')) !== true)
    return 'The window is not an NSWindow: Electrobun has changed.';
  let look = 0n; // nil: the system's own appearance.
  if (preference !== 'auto') {
    const named = preference === 'dark' ? 'NSAppearanceNameDarkAqua' : 'NSAppearanceNameAqua';
    const name = obj(sendText(obj(send(cls('NSString'), sel('alloc'))), sel('initWithUTF8String:'), c(named)));
    look = obj(sendObject(cls('NSAppearance'), sel('appearanceNamed:'), name));
    send(name, sel('release'));
    if (look === 0n) return `macOS has no ${named}.`;
  }
  sendOnMain(nsWindow, sel('performSelectorOnMainThread:withObject:waitUntilDone:'), sel('setAppearance:'), look, true);
  return null;
}
