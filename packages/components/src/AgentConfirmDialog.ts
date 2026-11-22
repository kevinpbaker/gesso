import { createComponent, OverlayService } from 'gesso-framework';
import type { AgentAnswer, AgentConfirmAsk } from 'gesso-framework/agent';
import { Column, percent, Row, Text } from 'gesso-core';

import { Button } from './Button';
import { Dialog } from './Dialog';

export interface AgentConfirmDialogOptions {
  /** The word on the button that declines. Default `Cancel`. */
  readonly cancelLabel?: string;
  /** The dialog's width, in logical pixels. Default 400. */
  readonly width?: number;
}

/**
 * Asks the person, in a `Dialog` on the application's own screen and
 * in its theme, whether an AI agent may send a command its contract
 * marks `@confirm`.
 *
 *   renderRoot(App).useAgentConfirm(agentConfirmDialog());
 *
 * The dialog says the question as the application worded it (from
 * `serve`'s `confirm`, or the text after `@confirm`), its detail, and
 * which agent is asking. The approving button carries the question's
 * own word (`Delete`), painted as danger when the command is
 * `@destructive`, and Cancel, Escape and a press outside decline. A
 * question withdrawn because nobody answered in time closes itself.
 */
export function agentConfirmDialog(options: AgentConfirmDialogOptions = {}): AgentConfirmAsk {
  let next = 0;
  return (request, { inject, environment, signal }) =>
    new Promise<AgentAnswer>(resolve => {
      const overlays = inject(OverlayService);
      // The dialog opens an overlay of its own; this entry only holds the
      // component, out of sight, with the application's theme to pass on.
      const id = `gesso:agent-confirm:${++next}`;
      let answered = false;
      const answer = (given: AgentAnswer) => {
        if (answered) return;
        answered = true;
        overlays.close(id);
        resolve(given);
      };
      signal.addEventListener('abort', () => answer('unavailable'), { once: true });
      if (signal.aborted) {
        answer('unavailable');
        return;
      }
      const { question } = request;
      const asker = `Asked by ${request.agent ?? 'an AI agent'}.${request.destructive ? ' This cannot be undone.' : ''}`;
      overlays.open({
        id,
        top: 0,
        left: 0,
        environment,
        content: createComponent(Dialog, {
          open: true,
          title: question.title,
          ...(question.detail === undefined || question.detail === '' ? {} : { description: question.detail }),
          width: options.width ?? 400,
          onClose: () => answer('declined'),
          content: Column(
            { width: percent(100), gap: 16 },
            Text({ text: asker, color: 'textMuted', textStyle: 'bodySmall', selectable: false }),
            Row(
              { width: percent(100), gap: 8, x: 'end' },
              createComponent(Button, {
                label: options.cancelLabel ?? 'Cancel',
                variant: 'outlined',
                onClick: () => answer('declined')
              }),
              createComponent(Button, {
                label: question.action ?? 'Allow',
                tone: request.destructive ? 'danger' : 'accent',
                onClick: () => answer('approved')
              })
            )
          )
        })
      });
    });
}
