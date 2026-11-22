import { describe, expect, it } from 'vitest';

import { Box } from 'gesso-core';
import type { AgentAnswer, AgentConfirmation } from 'gesso-framework/agent';
import { renderTest } from 'gesso-testing';

import { agentConfirmDialog } from './AgentConfirmDialog';

const request: AgentConfirmation = {
  channel: 'expenses',
  command: 'remove',
  arguments: { id: 'e1' },
  destructive: true,
  question: { title: 'Delete this expense?', detail: '$3.35 Transport, Bus fare', action: 'Delete' },
  agent: 'Claude Code'
};

function asked(signal = new AbortController().signal) {
  const ui = renderTest(Box({ width: 800, height: 600 }), { width: 800, height: 600 });
  let answer: AgentAnswer | undefined;
  void Promise.resolve(
    agentConfirmDialog()(request, {
      inject: service => ui.runtime.services.get(service),
      environment: null,
      signal
    })
  ).then(given => (answer = given as AgentAnswer));
  ui.frame();
  return { ui, answer: () => answer };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('agentConfirmDialog', () => {
  it("asks in the application's words, says which agent asks, and approves on the question's own button", async () => {
    const { ui, answer } = asked();
    const dialog = ui.getByRole('dialog', { name: 'Delete this expense?' });
    expect(ui.getSemantics(dialog).description).toBe('$3.35 Transport, Bus fare');
    expect(ui.getByText('Asked by Claude Code. This cannot be undone.')).toBeDefined();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Delete' }));
    ui.frame();
    await settle();
    expect(answer()).toBe('approved');
    expect(ui.queryByRole('dialog')).toBeNull();
  });

  it('declines on Cancel', async () => {
    const { ui, answer } = asked();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Cancel' }));
    ui.frame();
    await settle();
    expect(answer()).toBe('declined');
  });

  it('closes itself when the question is withdrawn, and says nobody answered', async () => {
    const withdrawn = new AbortController();
    const { ui, answer } = asked(withdrawn.signal);
    withdrawn.abort();
    ui.frame();
    await settle();
    expect(answer()).toBe('unavailable');
    expect(ui.queryByRole('dialog')).toBeNull();
  });
});
