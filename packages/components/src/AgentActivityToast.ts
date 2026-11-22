import { BehaviorSubject, buffer, debounceTime, filter, share } from 'rxjs';

import {
  AgentActivityService,
  createComponent,
  describeAgentActivity,
  input,
  type ComponentContext,
  type Inputs
} from 'gesso-framework';
import type { UiChild } from 'gesso-core';

import { Toast, type ToastPlacement } from './Toast';

export interface AgentActivityToastProps {
  /**
   * How long the agent must be quiet, in milliseconds, before what it did
   * is said, so a run of nine changes is one notice. Default 1200.
   */
  quietMs?: number;
  /** Milliseconds before the notice dismisses itself. Default 6000; 0 keeps it up. */
  duration?: number;
  placement?: ToastPlacement;
}

/**
 * Tells the person what an AI agent just did to the application, once
 * it has stopped: "Claude Code made 9 changes: update ×9."
 *
 * Put one anywhere in the application; it shows itself. It reads the
 * runtime's `AgentActivityService`, which the agent bridge writes for
 * every command an agent sends and every control it presses, and says
 * each burst of changes in a `Toast` (`status`, so a screen reader
 * announces it without moving focus). Calls that changed nothing, that
 * the person declined, or that failed are not announced; the service
 * still holds them.
 */
export function AgentActivityToast(inputs: Inputs<AgentActivityToastProps>, ctx: ComponentContext): UiChild {
  const quietMs = input(inputs.quietMs, 1200).value ?? 1200;
  const activity = ctx.inject(AgentActivityService);
  const message = new BehaviorSubject('');
  const open = new BehaviorSubject(false);

  const changes = activity.latest.pipe(
    filter(entry => entry.outcome === 'changed'),
    share()
  );
  ctx.effect(changes.pipe(buffer(changes.pipe(debounceTime(quietMs)))), burst => {
    const said = describeAgentActivity(burst);
    if (said === '') return;
    // Closed first, so the same sentence twice is a new notice with its whole duration.
    open.next(false);
    message.next(said);
    open.next(true);
  });

  return createComponent(Toast, {
    open,
    message,
    duration: input(inputs.duration, 6000),
    placement: input(inputs.placement, 'bottom-start'),
    onClose: () => open.next(false)
  });
}
