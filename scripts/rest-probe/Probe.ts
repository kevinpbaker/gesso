import { defineChannel } from '../../packages/framework/src/channel/ChannelToken.ts';

/**
 * What one `channel:command` looked like as it arrived on the worker's
 * port: the first argument as `payload`, the others as `rest`.
 */
export interface Wire {
  readonly command: string;
  readonly payload: unknown;
  readonly rest?: unknown[];
}

/**
 * The one channel the probe serves.
 *
 * `move` is the shape `decisions/0080` gave Segue's queue: more than one
 * argument, none of them an object. `calls` is what the handler was
 * called with, and `wire` is what the message was before the handler
 * saw it, kept so the check can say both that the arguments arrived and
 * that they arrived as `rest` beside `payload` rather than folded into
 * it by something on the way.
 */
export const Probe = defineChannel('probe', {
  view: {
    calls: [] as readonly (readonly unknown[])[],
    wire: [] as readonly Wire[]
  },
  commands: {} as {
    move(from: number, to: number, why: string): void;
  }
});
