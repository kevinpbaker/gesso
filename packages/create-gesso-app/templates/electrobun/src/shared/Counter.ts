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

/**
 * What a window, or an AI agent, can ask the main process to do.
 *
 * The JSDoc here is read by people and agents both: `gesso-channels`
 * turns it into the descriptions an agent sees, so it says what each
 * command does rather than how it is built.
 */
export interface CounterCommands {
  /**
   * Adds to the count.
   * @param by How much to add; negative to subtract.
   */
  increment: (by: number) => void;
  /**
   * Switches every window between dark and light.
   * @param dark True for dark.
   */
  setDark: (dark: boolean) => void;
}

// The name is the application's own, and both sides have to agree on
// it. The second argument is what a window shows before the main
// process has answered, which on a desktop is a few milliseconds. These
// are line comments rather than JSDoc because the JSDoc below is what
// an AI agent is told the channel is, and this is for you.

/** A counter shared by every window of the app, and whether the app is dark or light. */
export const Counter = channel<CounterView, CounterCommands>('counter', { count: 0, dark: true });
