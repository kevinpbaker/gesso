/**
 * The count, as a channel: a token both sides import, holding only
 * names and shapes.
 *
 * Moving the count out of `App.tsx` and into a channel is what puts it
 * in reach of an AI agent. Run `pnpm dev`, add the endpoint it prints to
 * your agent, and it is offered `clicks_view`, `clicks_add` and
 * `clicks_reset`, described by the comments below. `reset` is marked
 * `@confirm`, so an agent's reset waits for you to agree.
 *
 * So write these comments for someone who has never seen the code: they
 * are what the agent reads. The dev server says when one is missing.
 */
import { defineChannel } from 'gesso-framework';

/** How many times the button has been pressed. */
export const Clicks = defineChannel('clicks', {
  view: {
    /** The count so far. */
    count: 0
  },
  commands: {} as {
    /**
     * Adds to the count, as the button does.
     * @param by How many to add; 1 when left out.
     */
    add(by?: number): void;
    /** Puts the count back to 0. The person is asked first. @destructive @confirm */
    reset(): void;
  }
});
