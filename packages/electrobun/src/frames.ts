/**
 * The whole wire format, which is deliberately smaller than the
 * channel protocol it carries.
 *
 * Three frames in each direction. `open` says a named channel wants a
 * stream, `data` carries one channel message, `close` ends a stream.
 * Nothing here knows what a channel is, what a patch is, or what a
 * command is: a frame's `body` is a string this module produced by
 * serializing a value it never looked inside. That restraint is the
 * rule `ELECTROBUN_ROADMAP.md` §2 states, and it is what keeps the
 * webview's main thread a transport rather than a router.
 */

/**
 * How much of a serialized message goes in one frame.
 *
 * Electrobun's transport fails above roughly 8 MiB in a single
 * message, and it fails badly: the main process throws while draining
 * and the sender sees only a timeout, so the real error is in a log
 * nobody is reading. A megabyte leaves eight times the headroom and
 * costs nothing at the measured rates. See
 * `docs/decisions/0070-electrobun-spike.md`.
 */
export const DEFAULT_CHUNK_BYTES = 1_048_576;

export type GessoFrame =
  | { readonly kind: 'open'; readonly stream: number; readonly name: string }
  | {
      readonly kind: 'data';
      readonly stream: number;
      readonly body: string;
      /** Absent unless the message was split; then 0-based. */
      readonly part?: number;
      /** Absent unless the message was split; then how many parts to expect. */
      readonly parts?: number;
    }
  | { readonly kind: 'close'; readonly stream: number }
  /**
   * The adapter's own traffic, which is not a channel: the appearance
   * the platform is in, and a url the application wants opened
   * outside the window. It carries a name and a serialized payload for
   * the same reason a `data` frame carries a body, and it is a
   * separate kind so that nothing has to reserve a stream number.
   */
  | { readonly kind: 'control'; readonly name: string; readonly body: string };

export function isGessoFrame(value: unknown): value is GessoFrame {
  const kind = (value as { kind?: unknown } | null)?.kind;
  return kind === 'open' || kind === 'data' || kind === 'close' || kind === 'control';
}

/** Wraps one control message. Never split: these are small by construction. */
export function frameControl(name: string, payload: unknown): GessoFrame {
  return { kind: 'control', name, body: JSON.stringify(payload ?? null) ?? 'null' };
}

/**
 * Serializes one channel message into the frames that carry it.
 *
 * JSON rather than structured clone, because the transport underneath
 * is JSON either way: `Electroview.createTransport` stringifies every
 * message before it encrypts it. That means `undefined` inside a value
 * does not survive, which is true of this transport with or without
 * this module, and which a view key cannot rely on anyway.
 */
export function frameData(stream: number, value: unknown, chunkBytes = DEFAULT_CHUNK_BYTES): GessoFrame[] {
  const body = JSON.stringify(value);
  if (body === undefined) {
    throw new Error(
      `A channel message for stream ${stream} could not be serialized. Only plain data crosses a channel; see requirePlainData.`
    );
  }
  if (body.length <= chunkBytes) {
    return [{ kind: 'data', stream, body }];
  }
  const parts = Math.ceil(body.length / chunkBytes);
  const frames: GessoFrame[] = [];
  for (let part = 0; part < parts; part++) {
    frames.push({
      kind: 'data',
      stream,
      body: body.slice(part * chunkBytes, (part + 1) * chunkBytes),
      part,
      parts
    });
  }
  return frames;
}

/**
 * Puts split messages back together.
 *
 * The transport delivers in order (`Electroview` dispatches through a
 * promise tail that preserves frame order), so a part that arrives out
 * of turn is a bug rather than a race, and it says so instead of
 * quietly assembling a corrupt message.
 */
export class FrameAssembler {
  private readonly partial = new Map<number, { parts: number; chunks: string[] }>();

  /**
   * Returns the value a `data` frame completes, or `undefined` while
   * more parts are still to come.
   */
  take(frame: GessoFrame & { kind: 'data' }): unknown {
    if (frame.parts === undefined) {
      return JSON.parse(frame.body);
    }
    const held = this.partial.get(frame.stream) ?? { parts: frame.parts, chunks: [] };
    const expected = held.chunks.length;
    if (frame.part !== expected) {
      this.partial.delete(frame.stream);
      throw new Error(
        `Stream ${frame.stream} received part ${String(frame.part)} when part ${expected} was next. ` +
          'Frames are expected in order; a gap means the transport reordered or dropped one.'
      );
    }
    held.chunks.push(frame.body);
    if (held.chunks.length < held.parts) {
      this.partial.set(frame.stream, held);
      return undefined;
    }
    this.partial.delete(frame.stream);
    return JSON.parse(held.chunks.join(''));
  }

  /** Drops anything half-received for a stream that has closed. */
  forget(stream: number): void {
    this.partial.delete(stream);
  }
}
