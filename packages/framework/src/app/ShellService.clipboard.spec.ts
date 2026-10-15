import { afterEach, describe, expect, it, vi } from 'vitest';

import { readClipboard, writeClipboard } from './EditingProxy';
import { ShellService, type ShellRequest } from './ShellService';

/**
 * `copyText` answers whether the text reached the clipboard.
 *
 * It used to answer nothing, so an application that said "Copied" after
 * a menu command or a shortcut said it whether or not the browser had
 * refused; and a key pressed in a render worker reaches the window's
 * clipboard a message after the gesture, which is when some browsers
 * refuse. Found by an issue tracker's "Copy link" command.
 */
describe('ShellService.copyText', () => {
  const collect = (): { service: ShellService; requests: ShellRequest[] } => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    return { service, requests };
  };

  it('asks the shell, and resolves with what the shell reports', async () => {
    const { service, requests } = collect();
    const copied = service.copyText('ENG-123');
    const refused = service.copyText('ENG-124');
    expect(requests).toEqual([
      { type: 'clipboard', id: 1, text: 'ENG-123' },
      { type: 'clipboard', id: 2, text: 'ENG-124' }
    ]);
    service.settleClipboard(2, false);
    service.settleClipboard(1, true);
    await expect(copied).resolves.toBe(true);
    await expect(refused).resolves.toBe(false);
  });

  it('resolves false at once when no shell is listening', async () => {
    await expect(new ShellService().copyText('x')).resolves.toBe(false);
  });

  it('ignores an answer it did not ask for, or a second one', async () => {
    const { service } = collect();
    const copied = service.copyText('x');
    service.settleClipboard(1, true);
    expect(() => service.settleClipboard(1, false)).not.toThrow();
    expect(() => service.settleClipboard(99, true)).not.toThrow();
    await expect(copied).resolves.toBe(true);
  });
});

describe('writeClipboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A document whose `execCommand('copy')` answers `works`. */
  const documentWhere = (works: boolean): Document => {
    const scratch = { value: '', style: {}, select: () => {}, remove: () => {} };
    return {
      activeElement: null,
      body: { appendChild: () => {} },
      createElement: () => scratch,
      execCommand: () => works
    } as unknown as Document;
  };

  it('is true when the async clipboard takes the text', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(writeClipboard('hello', documentWhere(false))).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand, and says what that did', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => Promise.reject(new Error('NotAllowedError')) } });
    await expect(writeClipboard('hello', documentWhere(true))).resolves.toBe(true);
    await expect(writeClipboard('hello', documentWhere(false))).resolves.toBe(false);
  });

  it('is false, not a rejection, when a document has no copy command at all', async () => {
    vi.stubGlobal('navigator', {});
    const doc = documentWhere(true);
    (doc as unknown as { execCommand: () => boolean }).execCommand = () => {
      throw new Error('not supported');
    };
    await expect(writeClipboard('hello', doc)).resolves.toBe(false);
  });
});

/**
 * `readText`: the clipboard's text for a Paste chosen from a menu, which,
 * unlike a key's, comes with no text of its own. Found by an editor's
 * right-click menu and its Edit menu, whose Paste did nothing.
 */
describe('ShellService.readText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the shell, and resolves with what it read, or null', async () => {
    const service = new ShellService();
    const requests: ShellRequest[] = [];
    service.setHandler(request => requests.push(request));
    const first = service.readText();
    const second = service.readText();
    expect(requests).toEqual([
      { type: 'clipboardRead', id: 1 },
      { type: 'clipboardRead', id: 2 }
    ]);
    service.settleClipboardRead(2, null);
    service.settleClipboardRead(1, 'pasted');
    expect(() => service.settleClipboardRead(1, 'again')).not.toThrow();
    await expect(first).resolves.toBe('pasted');
    await expect(second).resolves.toBeNull();
    await expect(new ShellService().readText()).resolves.toBeNull();
  });

  it('reads through the async clipboard, and is null where it refuses or is missing', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: async () => 'text' } });
    await expect(readClipboard()).resolves.toBe('text');
    vi.stubGlobal('navigator', { clipboard: { readText: async () => Promise.reject(new Error('NotAllowedError')) } });
    await expect(readClipboard()).resolves.toBeNull();
    vi.stubGlobal('navigator', {});
    await expect(readClipboard()).resolves.toBeNull();
  });
});
