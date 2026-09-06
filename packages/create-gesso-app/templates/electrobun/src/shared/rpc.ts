/**
 * The one message a window and the main process exchange.
 *
 * Every channel, every patch and every command is carried inside
 * `gessoFrame`, so this type does not grow as the application does. It
 * is a `message` rather than a `request` on purpose: a patch expects no
 * answer and a command expects no answer, and a request would put a
 * timeout on a stream that runs for the life of the window.
 */
import type { GessoFrame } from '@gesso/electrobun';
import type { RPCSchema } from 'electrobun/view';

export type GessoWindowRPC = {
  bun: RPCSchema<{
    requests: Record<string, never>;
    messages: { gessoFrame: GessoFrame };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: { gessoFrame: GessoFrame };
  }>;
};
