import type { UiDroppedFile, UiFileDropMessage } from 'gesso-core';

/**
 * The shell half of an OS file drop.
 *
 * `UiDragSession.applyFileDrop` has turned a `fileDrop` message into
 * an ordinary drag since drop targets arrived; what was missing was a
 * shell that posted one, so a zone accepting `EXTERNAL_FILES` could be
 * written, spec'd and never reached. This is that shell, for a browser:
 * the four DOM drag events on the surface, turned into the four phases
 * of the message.
 *
 * Shared by both configurations because it is the same four events
 * either way. The worker shell posts the message across and transfers
 * the bytes; the single-thread shell hands it straight to its runtime.
 * Neither decides anything about the files — whether a drop is taken,
 * and what it means, is the zone's.
 *
 * **Only drags that carry files.** A drag of selected text from
 * another page over the canvas is not a file drop, and answering it
 * would put a drop cursor over an application that cannot take it.
 */

export interface FileDropSink {
  /**
   * One phase of a drop. `transfer` holds the dropped files' buffers
   * on `drop`, for a sink that posts across a thread and can move them
   * rather than copy them; it is empty on every other phase.
   */
  (message: UiFileDropMessage, transfer: ArrayBuffer[]): void;
}

/** The slice of a DOM element this needs, so a spec can double it. */
export interface FileDropTarget {
  addEventListener(type: string, listener: (event: DragEvent) => void): void;
  removeEventListener(type: string, listener: (event: DragEvent) => void): void;
}

/**
 * Listens for files dragged over `target` and reports them to `sink`.
 *
 * `toLocal` is the shell's own client-to-surface conversion, so a drop
 * lands at the point a press at the same place would.
 *
 * `dragover` has its default prevented on every event, not only the
 * first: that is what tells the browser the drop is wanted, and the
 * browser asks again on each one. `drop` has it prevented too, or the
 * browser navigates away to show the file — which, over an
 * application, is the tab being replaced by a CSV.
 *
 * During the drag the platform lets a page read a file's type and not
 * its name or size, so `enter` and `over` carry what it allows; `drop`
 * carries all of it, bytes included. Reading the bytes is asynchronous,
 * so the `drop` message goes when they are read, and a drop whose files
 * cannot be read is reported as a `leave` so that the zone does not
 * stay lit waiting for a drop that will never arrive.
 *
 * Returns the function that stops listening.
 */
export function attachFileDrop(
  target: FileDropTarget,
  toLocal: (clientX: number, clientY: number) => { x: number; y: number },
  sink: FileDropSink
): () => void {
  let inside = false;

  const post = (phase: UiFileDropMessage['phase'], event: DragEvent, files: readonly UiDroppedFile[]): void => {
    const { x, y } = toLocal(event.clientX, event.clientY);
    sink({ type: 'fileDrop', phase, x, y, files }, []);
  };

  const onEnterOrOver = (event: DragEvent): void => {
    if (!carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'copy';
    }
    post(inside ? 'over' : 'enter', event, filesDuringDrag(event));
    inside = true;
  };

  const onLeave = (event: DragEvent): void => {
    if (!inside) {
      return;
    }
    inside = false;
    post('leave', event, []);
  };

  const onDrop = (event: DragEvent): void => {
    if (!carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    inside = false;
    const { x, y } = toLocal(event.clientX, event.clientY);
    const files = Array.from(event.dataTransfer?.files ?? []);
    void Promise.all(files.map(file => file.arrayBuffer())).then(
      buffers => {
        const dropped: UiDroppedFile[] = files.map((file, at) => ({
          name: file.name,
          mediaType: file.type,
          size: file.size,
          lastModified: file.lastModified,
          bytes: buffers[at]
        }));
        sink({ type: 'fileDrop', phase: 'drop', x, y, files: dropped }, buffers);
      },
      () => sink({ type: 'fileDrop', phase: 'leave', x, y, files: [] }, [])
    );
  };

  target.addEventListener('dragenter', onEnterOrOver);
  target.addEventListener('dragover', onEnterOrOver);
  target.addEventListener('dragleave', onLeave);
  target.addEventListener('drop', onDrop);
  return () => {
    target.removeEventListener('dragenter', onEnterOrOver);
    target.removeEventListener('dragover', onEnterOrOver);
    target.removeEventListener('dragleave', onLeave);
    target.removeEventListener('drop', onDrop);
  };
}

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types !== undefined && Array.from(types).includes('Files');
}

/** What a drag in flight lets a page see of its files: their types. */
function filesDuringDrag(event: DragEvent): UiDroppedFile[] {
  const items = Array.from(event.dataTransfer?.items ?? []);
  return items
    .filter(item => item.kind === 'file')
    .map(item => ({ name: '', mediaType: item.type, size: 0, lastModified: 0 }));
}
