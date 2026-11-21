import type { ShellFileRequest, ShellFileType } from './ShellService';
import type { ShellDirectoryHandle, ShellFileHandle } from './shellFiles';

/**
 * The one part of a file request that has to happen at once: showing
 * the picker.
 *
 * A browser shows a picker only while the click that asked for it is
 * fresh — about five seconds in Chrome — and refuses afterwards with a
 * `SecurityError`. Everything else a request does (reading the file,
 * remembering its handle, writing to it) can wait. `WorkerApp` loads
 * `shellFiles` after mount to keep it off the main thread's first parse,
 * so a request can arrive before that module has; when it did, the
 * picker waited on the fetch, and on a slow connection the click had
 * gone stale by the time it was shown. This file is small and loaded
 * with the shell, so the picker is opened in the same task as the
 * message that asked for it, and what it answers is handed to
 * `ShellFiles` whenever that arrives.
 *
 * `reopen` and `save` to a handle are not covered: the permission they
 * may ask for needs the handle, which is in IndexedDB and reached
 * through `shellFiles`. An application nearly always has that handle
 * from an answer the module gave, so the module is loaded by then.
 */

/** What a picker is told. */
export interface PickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

/** The pickers a window has. Each is absent where the browser has none. */
export interface ShellPickers {
  showOpenFilePicker?(options: PickerOptions & { multiple: boolean }): Promise<ShellFileHandle[]>;
  showSaveFilePicker?(options: PickerOptions & { suggestedName: string }): Promise<ShellFileHandle>;
  showDirectoryPicker?(options: { mode: 'read' | 'readwrite' }): Promise<ShellDirectoryHandle>;
  /** A file input, clicked. Null when it was dismissed. */
  pickWithInput?(accept: string, multiple: boolean): Promise<File[] | null>;
}

/** A picker already showing, and what it will answer. */
export type OpenedPicker =
  | { readonly via: 'open'; readonly handles: Promise<ShellFileHandle[]> }
  | { readonly via: 'input'; readonly files: Promise<File[] | null> }
  | { readonly via: 'directory'; readonly handle: Promise<ShellDirectoryHandle> }
  | { readonly via: 'save'; readonly handle: Promise<ShellFileHandle> };

/**
 * Shows the picker a request needs, synchronously, or answers null for
 * a request that needs none — or for a browser without that picker,
 * where `ShellFiles` decides what to do instead.
 */
export function openPicker(pickers: ShellPickers, request: ShellFileRequest): OpenedPicker | null {
  switch (request.op) {
    case 'open':
      if (pickers.showOpenFilePicker !== undefined) {
        return {
          via: 'open',
          handles: started(() =>
            pickers.showOpenFilePicker!({ ...pickerTypes(request.accept), multiple: request.multiple })
          )
        };
      }
      if (pickers.pickWithInput !== undefined) {
        return {
          via: 'input',
          files: started(() => pickers.pickWithInput!(inputAccept(request.accept), request.multiple))
        };
      }
      return null;
    case 'openDirectory':
      if (pickers.showDirectoryPicker !== undefined) {
        return { via: 'directory', handle: started(() => pickers.showDirectoryPicker!({ mode: request.mode })) };
      }
      return null;
    case 'save':
      if (request.handle === undefined && pickers.showSaveFilePicker !== undefined) {
        return {
          via: 'save',
          handle: started(() =>
            pickers.showSaveFilePicker!({ ...pickerTypes(request.accept), suggestedName: request.name })
          )
        };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Calls `show` now, and answers what it answers — a throw included, as a
 * rejection, so that `ShellFiles` meets every outcome in one place.
 *
 * The promise is marked handled here because nothing may await it for a
 * while: a picker closed before `shellFiles` has loaded would otherwise
 * be reported as an unhandled rejection, though `perform` answers it.
 */
function started<T>(show: () => Promise<T>): Promise<T> {
  const answer = new Promise<T>(resolve => resolve(show()));
  answer.catch(() => undefined);
  return answer;
}

/** The pickers of a real window, and a file input where it has none. */
export function windowPickers(view: Window & typeof globalThis): ShellPickers {
  const own = view as unknown as ShellPickers;
  return {
    showOpenFilePicker: own.showOpenFilePicker?.bind(view),
    showSaveFilePicker: own.showSaveFilePicker?.bind(view),
    showDirectoryPicker: own.showDirectoryPicker?.bind(view),
    pickWithInput: (accept, multiple) =>
      new Promise(resolve => {
        const input = view.document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
        // `cancel` is what a dismissed picker fires, where the browser
        // fires anything at all; without it a dismissal is a promise
        // that waits, which is what every file input has always done.
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      })
  };
}

function pickerTypes(accept: readonly ShellFileType[]): PickerOptions {
  if (accept.length === 0) {
    return {};
  }
  return {
    types: accept.map(type => ({ description: type.description, accept: { [type.mediaType]: [...type.extensions] } })),
    excludeAcceptAllOption: false
  };
}

function inputAccept(accept: readonly ShellFileType[]): string {
  return accept.flatMap(type => [...type.extensions, type.mediaType]).join(',');
}
