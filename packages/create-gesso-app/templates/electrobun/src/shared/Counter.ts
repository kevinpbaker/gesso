/**
 * The channel the main process serves and every window replicates.
 *
 * Declared once and imported by both sides, which is the whole of what
 * they share: a token, the keys a window can see, the commands it can
 * send, and no framework type above it. Nothing in here is anything
 * but plain data, because plain data is all that crosses a channel.
 */
import { channel } from 'gesso-framework';

export interface CounterView {
  /** The application's whole state, and it lives in the main process. */
  count: number;
  /** Which appearance every window is in. One setting, all windows. */
  dark: boolean;
}

export interface CounterCommands {
  increment: (by: number) => void;
  setDark: (dark: boolean) => void;
}

/**
 * The name is the application's own, and both sides have to agree on
 * it. The second argument is what a window shows before the main
 * process has answered, which on a desktop is a few milliseconds.
 */
export const Counter = channel<CounterView, CounterCommands>('counter', { count: 0, dark: true });
