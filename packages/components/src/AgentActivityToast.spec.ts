import { describe, expect, it, vi } from 'vitest';

import { Box } from 'gesso-core';
import { AgentActivityService, createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { AgentActivityToast } from './AgentActivityToast';

describe('AgentActivityToast', () => {
  it('says what an agent did once it has been quiet, as one notice a screen reader announces', () => {
    vi.useFakeTimers();
    try {
      const ui = renderTest(Box({ width: 800, height: 600 }, createComponent(AgentActivityToast, { quietMs: 500 })), {
        width: 800,
        height: 600
      });
      const activity = ui.runtime.services.get(AgentActivityService);
      const change = (outcome: 'changed' | 'declined') =>
        activity.record({
          at: 0,
          agent: 'Claude Code',
          tool: 'tracker_update',
          title: 'tracker: update',
          arguments: {},
          outcome
        });
      for (let i = 0; i < 9; i++) change('changed');
      change('declined');
      ui.frame();
      expect(ui.queryByRole('status')).toBeNull();

      vi.advanceTimersByTime(500);
      ui.frame();
      expect(ui.getByRole('status', { name: 'Claude Code made 9 changes: update ×9.' })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
