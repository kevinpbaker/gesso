import { describe, expect, it } from 'vitest';

import {
  Box,
  Column,
  dropTarget,
  EXTERNAL_FILES,
  type UiDragPayload,
  type UiDroppedFile,
  type UiFileDropMessage
} from 'gesso-core';

import { attachFileDrop, type FileDropTarget } from './fileDrop';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * The shell half of an OS file drop, and the runtime half it feeds.
 *
 * The DOM is doubled — a node environment has no `DragEvent` — in the
 * way `WorkerApp.input.spec` doubles a canvas: what runs is exactly the
 * listener a browser would call, handed the fields it reads.
 */

class FakeTarget implements FileDropTarget {
  readonly listeners = new Map<string, (event: DragEvent) => void>();

  addEventListener(type: string, listener: (event: DragEvent) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  fire(type: string, event: FakeDrag): void {
    this.listeners.get(type)?.(event as unknown as DragEvent);
  }
}

interface FakeFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

class FakeDrag {
  prevented = false;
  readonly dataTransfer: {
    types: string[];
    items: { kind: string; type: string }[];
    files: FakeFile[];
    dropEffect: string;
  };

  constructor(
    readonly clientX: number,
    readonly clientY: number,
    files: FakeFile[] = [],
    types = ['Files']
  ) {
    this.dataTransfer = {
      types,
      items: files.map(file => ({ kind: 'file', type: file.type })),
      files,
      dropEffect: 'none'
    };
  }

  preventDefault(): void {
    this.prevented = true;
  }
}

function file(name: string, text: string, fail = false): FakeFile {
  const bytes = new TextEncoder().encode(text).buffer;
  return {
    name,
    type: 'text/csv',
    size: bytes.byteLength,
    lastModified: 7,
    arrayBuffer: () => (fail ? Promise.reject(new Error('gone')) : Promise.resolve(bytes))
  };
}

function harness() {
  const target = new FakeTarget();
  const sent: { message: UiFileDropMessage; transfer: ArrayBuffer[] }[] = [];
  const detach = attachFileDrop(
    target,
    (x, y) => ({ x: x - 10, y: y - 20 }),
    (message, transfer) => sent.push({ message, transfer })
  );
  return { target, sent, detach };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('the shell half of a file drop', () => {
  it('reports a drag of files over the surface, in its coordinates, and accepts it', () => {
    const { target, sent } = harness();
    const enter = new FakeDrag(110, 220, [file('a.csv', 'x')]);
    target.fire('dragenter', enter);
    const over = new FakeDrag(120, 230, [file('a.csv', 'x')]);
    target.fire('dragover', over);

    expect(sent.map(each => [each.message.phase, each.message.x, each.message.y])).toEqual([
      ['enter', 100, 200],
      ['over', 110, 210]
    ]);
    // Only the type is readable while the drag is in flight.
    expect(sent[0].message.files).toEqual([{ name: '', mediaType: 'text/csv', size: 0, lastModified: 0 }]);
    // Prevented on every dragover, which is what tells a browser the drop is wanted.
    expect(enter.prevented && over.prevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe('copy');
  });

  it('ignores a drag that carries no files', () => {
    const { target, sent } = harness();
    const text = new FakeDrag(0, 0, [], ['text/plain']);
    target.fire('dragover', text);
    target.fire('drop', text);
    expect(sent).toEqual([]);
    expect(text.prevented).toBe(false);
  });

  it('reports leaving only after entering', () => {
    const { target, sent } = harness();
    target.fire('dragleave', new FakeDrag(0, 0));
    target.fire('dragenter', new FakeDrag(0, 0, [file('a.csv', 'x')]));
    target.fire('dragleave', new FakeDrag(0, 0));
    expect(sent.map(each => each.message.phase)).toEqual(['enter', 'leave']);
  });

  it('sends the files on drop with their bytes, and moves the buffers', async () => {
    const { target, sent } = harness();
    const drop = new FakeDrag(60, 70, [file('a.csv', 'Region,Units')]);
    target.fire('drop', drop);
    // Prevented synchronously, or the browser replaces the tab with the file.
    expect(drop.prevented).toBe(true);
    await settle();

    const [{ message, transfer }] = sent;
    expect(message.phase).toBe('drop');
    expect([message.x, message.y]).toEqual([50, 50]);
    const [dropped] = message.files as UiDroppedFile[];
    expect({ ...dropped, bytes: undefined }).toEqual({
      name: 'a.csv',
      mediaType: 'text/csv',
      size: 12,
      lastModified: 7,
      bytes: undefined
    });
    expect(new TextDecoder().decode(dropped.bytes)).toBe('Region,Units');
    expect(transfer).toEqual([dropped.bytes]);
  });

  it('reports a drop it could not read as leaving, so nothing waits for it', async () => {
    const { target, sent } = harness();
    target.fire('dragenter', new FakeDrag(0, 0, [file('a.csv', 'x')]));
    target.fire('drop', new FakeDrag(0, 0, [file('a.csv', 'x', true)]));
    await settle();
    expect(sent.map(each => each.message.phase)).toEqual(['enter', 'leave']);
  });

  it('stops listening when detached', () => {
    const { target, detach } = harness();
    detach();
    expect(target.listeners.size).toBe(0);
  });
});

describe('a file drop reaching the tree', () => {
  /** The whole point: a zone written for EXTERNAL_FILES is a zone like any other. */
  it('lands in a zone that accepts files, with the files as its payload', () => {
    const dropped: UiDragPayload[] = [];
    const entered: string[] = [];
    const zone = dropTarget({
      accepts: EXTERNAL_FILES,
      onEnter: payload => entered.push(payload.type),
      onDrop: payload => {
        dropped.push(payload);
      }
    });
    const { runtime, frame } = mountRuntime(
      Column({ width: 800, height: 600 }, Box({ width: 400, height: 300, modifiers: [zone] }))
    );
    frame();

    const bytes = new TextEncoder().encode('a,b').buffer;
    const files: UiDroppedFile[] = [{ name: 'a.csv', mediaType: 'text/csv', size: 3, lastModified: 0, bytes }];
    runtime.applyFileDrop({ type: 'fileDrop', phase: 'enter', x: 50, y: 50, files: [] });
    runtime.applyFileDrop({ type: 'fileDrop', phase: 'drop', x: 60, y: 60, files });

    expect(entered).toEqual([EXTERNAL_FILES]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].data).toEqual(files);
  });

  it('misses a zone the point is not in', () => {
    const dropped: UiDragPayload[] = [];
    const zone = dropTarget({ accepts: EXTERNAL_FILES, onDrop: payload => void dropped.push(payload) });
    const { runtime, frame } = mountRuntime(
      Column({ width: 800, height: 600 }, Box({ width: 100, height: 100, modifiers: [zone] }))
    );
    frame();
    runtime.applyFileDrop({ type: 'fileDrop', phase: 'drop', x: 500, y: 500, files: [] });
    expect(dropped).toEqual([]);
  });
});
