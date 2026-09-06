import { describe, expect, it } from 'vitest';

import { OpfsStorage, type OpfsDirectory, type OpfsFileHandle, type OpfsWritable } from './OpfsStorage';

function named(name: string, message = 'refused'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * A directory of strings, with the two failures a real one has.
 *
 * Enough of OPFS to hold the adapter to its contract, and no more: a
 * spec that stood up a file system would be a spec about file systems.
 */
class FakeDirectory implements OpfsDirectory {
  readonly files = new Map<string, string>();
  /** Thrown by the next call, once. */
  next: Error | null = null;
  opens = 0;

  getDirectoryHandle(): Promise<OpfsDirectory> {
    this.opens++;
    return this.take() ?? Promise.resolve(this);
  }

  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle> {
    const refusal = this.take();
    if (refusal !== null) {
      return refusal;
    }
    if (!this.files.has(name) && options?.create !== true) {
      return Promise.reject(named('NotFoundError', 'no such file'));
    }
    const writable: OpfsWritable = {
      write: (data: string) => {
        this.files.set(name, data);
        return Promise.resolve();
      },
      close: () => Promise.resolve()
    };
    return Promise.resolve({
      getFile: () => Promise.resolve({ text: () => Promise.resolve(this.files.get(name) ?? '') }),
      createWritable: () => this.take() ?? Promise.resolve(writable)
    });
  }

  removeEntry(name: string): Promise<void> {
    const refusal = this.take();
    if (refusal !== null) {
      return refusal;
    }
    if (!this.files.delete(name)) {
      return Promise.reject(named('NotFoundError', 'no such file'));
    }
    return Promise.resolve();
  }

  keys(): AsyncIterable<string> {
    const names = [...this.files.keys()];
    return {
      async *[Symbol.asyncIterator]() {
        for (const name of names) {
          yield name;
        }
      }
    };
  }

  private take(): Promise<never> | null {
    const error = this.next;
    if (error === null) {
      return null;
    }
    this.next = null;
    return Promise.reject(error);
  }
}

function storeOn(directory: FakeDirectory): OpfsStorage {
  return new OpfsStorage({ directory: 'specs', root: () => Promise.resolve(directory) });
}

describe('OpfsStorage', () => {
  it('writes and reads a record back', async () => {
    const directory = new FakeDirectory();
    const store = storeOn(directory);

    expect(await store.write('queue', '{"order":[]}')).toBe('ok');
    expect(await store.read('queue')).toEqual({ outcome: 'ok', value: '{"order":[]}', error: null });
  });

  it('says a record that was never written is not there', async () => {
    const store = storeOn(new FakeDirectory());

    // `ok` with no value, and not a failure: a first run is not an
    // error condition.
    expect(await store.read('queue')).toEqual({ outcome: 'ok', value: null, error: null });
  });

  it('names a key so a listing reads as the keys that were written', async () => {
    const directory = new FakeDirectory();
    const store = storeOn(directory);

    await store.write('one/two', 'a');
    await store.write('plain', 'b');

    expect([...directory.files.keys()]).toEqual(['one%2Ftwo.json', 'plain.json']);
    expect(await store.keys()).toEqual(['one/two', 'plain']);
  });

  it('answers denied when the platform has no OPFS', async () => {
    const store = new OpfsStorage({ root: () => Promise.reject(new TypeError('no OPFS here')) });

    const read = await store.read('queue');
    expect(read.outcome).toBe('denied');
    expect(read.error).toBe('no OPFS here');
    expect(await store.write('queue', 'a')).toBe('denied');
  });

  it('answers full when the quota is spent, and keeps working after', async () => {
    const directory = new FakeDirectory();
    const store = storeOn(directory);
    directory.next = named('QuotaExceededError', 'no room');

    expect(await store.write('queue', 'a')).toBe('full');
    // Not `denied`, so the next write is still attempted: a quota can
    // be given back and this one is.
    expect(await store.write('queue', 'a')).toBe('ok');
  });

  it('treats removing what is not there as done', async () => {
    const store = storeOn(new FakeDirectory());

    expect(await store.remove('queue')).toBe('ok');
  });

  it('opens the folder once and reuses it', async () => {
    const directory = new FakeDirectory();
    const store = storeOn(directory);

    await store.write('a', '1');
    await store.write('b', '2');
    await store.read('a');

    expect(directory.opens).toBe(1);
  });

  it('opens again after a denial, in case the answer has changed', async () => {
    const directory = new FakeDirectory();
    let refuse = true;
    const store = new OpfsStorage({
      root: () => (refuse ? Promise.reject(new TypeError('blocked')) : Promise.resolve(directory))
    });

    expect(await store.write('a', '1')).toBe('denied');
    refuse = false;
    expect(await store.write('a', '1')).toBe('ok');
  });

  it('answers an empty listing rather than failing', async () => {
    const store = new OpfsStorage({ root: () => Promise.reject(new TypeError('no OPFS here')) });

    expect(await store.keys()).toEqual([]);
  });
});
