import { printPropValue } from '../app/NodeReport';
import type { ConsoleEntry } from '../app/DevtoolsProtocol';

/**
 * Forwarding a worker's `console.*`.
 *
 * A worker's console is real, but it is in devtools' worker target,
 * which a developer has to know to select and cannot read alongside
 * the page's. So while a devtools panel asks for it, each `console.*`
 * call in the worker is also handed to a sink as plain strings, with
 * the thread named, and the panel shows the three threads as one log.
 *
 * The call still reaches the worker's own console: this is a copy,
 * not a redirect, so turning a panel on changes nothing about what
 * devtools' worker target shows.
 */

export type ConsoleLevel = ConsoleEntry['level'];

const LEVELS: readonly ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

/** An entry before the shell has said which thread it came from. */
export type ConsoleEntryBody = Omit<ConsoleEntry, 'thread'>;

/**
 * Copies every `console.*` call on `target` (the worker global's
 * console by default) to `sink`. Returns a function that restores the
 * original methods.
 *
 * Idempotent per target: a second capture on the same console replaces
 * the first's sink rather than nesting, so toggling a panel on twice
 * does not log twice.
 */
export function captureConsole(sink: (entry: ConsoleEntryBody) => void, target: Console = console): () => void {
  const installed = (target as Console & { [CAPTURED]?: { sink: typeof sink; restore: () => void } })[CAPTURED];
  if (installed !== undefined) {
    installed.sink = sink;
    return installed.restore;
  }
  const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();
  const state = {
    sink,
    restore: (): void => {
      for (const [level, original] of originals) {
        target[level] = original;
      }
      delete (target as Console & { [CAPTURED]?: unknown })[CAPTURED];
    }
  };
  for (const level of LEVELS) {
    const original = target[level] as (...args: unknown[]) => void;
    originals.set(level, original);
    target[level] = (...args: unknown[]): void => {
      original.apply(target, args);
      // A sink that throws must not break the application's logging,
      // least of all while a developer is trying to read it.
      try {
        state.sink({ level, args: args.map(formatConsoleArg), at: Date.now() });
      } catch {
        // Nothing to do: the original call already ran.
      }
    };
  }
  (target as Console & { [CAPTURED]?: typeof state })[CAPTURED] = state;
  return state.restore;
}

const CAPTURED = Symbol.for('gesso:console-captured');

/**
 * One console argument as the panel prints it.
 *
 * `printPropValue` already prints the values a canvas UI is likely to
 * log; an Error is the one thing it prints badly (`{}`), and the one
 * thing a developer most wants to read whole.
 */
export function formatConsoleArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack !== undefined && value.stack !== '' ? value.stack : `${value.name}: ${value.message}`;
  }
  return printPropValue(value);
}

/** The shell's request to an application worker to start or stop forwarding. */
export interface ConsoleForwardingMessage {
  type: 'gesso:console';
  enabled: boolean;
}

/** An application worker's forwarded entry. */
export interface ConsoleEntryMessage {
  type: 'gesso:console';
  entry: ConsoleEntryBody;
}

export function isConsoleForwardingMessage(value: unknown): value is ConsoleForwardingMessage {
  const message = value as { type?: unknown; enabled?: unknown } | null;
  return message?.type === 'gesso:console' && typeof message.enabled === 'boolean';
}

export function isConsoleEntryMessage(value: unknown): value is ConsoleEntryMessage {
  const message = value as { type?: unknown; entry?: unknown } | null;
  return message?.type === 'gesso:console' && typeof message.entry === 'object' && message.entry !== null;
}
