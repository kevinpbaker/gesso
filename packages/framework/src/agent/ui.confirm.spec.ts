import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Button, Column, EditableText, type UiTextChangeEvent } from 'gesso-core';
import { mountRuntime } from '../app/RuntimeTestUtils';
import { resultText, type AgentConfirmation, type AgentConfirmResult } from './AgentSurface';
import { uiSurface, type UiHost } from './ui';

/**
 * A screen with its own confirmation: a Delete inside a box marked for
 * approval, a field that asks with no words of its own, a Save that
 * asks nothing, and a Keep that opts out inside the marked box.
 */
function screen(answer?: (request: AgentConfirmation) => AgentConfirmResult) {
  const deleted = new BehaviorSubject(0);
  const saved = new BehaviorSubject(0);
  const kept = new BehaviorSubject(0);
  const note = new BehaviorSubject('');
  const mounted = mountRuntime(
    Column(
      Box(
        { agentConfirm: 'Delete the expense "Bus fare"?' },
        Button({ text: 'Delete', onClick: () => deleted.next(deleted.value + 1) }),
        Button({ text: 'Keep', agentConfirm: false, onClick: () => kept.next(kept.value + 1) })
      ),
      EditableText({
        value: note,
        label: 'Note',
        agentConfirm: true,
        onInput: (event: UiTextChangeEvent) => note.next(event.value)
      }),
      Button({ text: 'Save', onClick: () => saved.next(saved.value + 1) })
    ),
    {}
  );
  mounted.frame(0);
  const runtime = mounted.runtime;
  const host: UiHost = {
    semanticsTree: () => runtime.semanticsTree(),
    focusedNodeId: () => runtime.focusedNodeId(),
    applySemanticsAction: action => runtime.applySemanticsAction(action),
    key: (key, modifiers) => {
      runtime.input.keyboard.keyDown(key, modifiers);
      runtime.input.keyboard.keyUp(key, modifiers);
    },
    flush: () => mounted.frame(),
    agentConfirmAt: id => runtime.agentConfirmAt(id)
  };
  const asked: AgentConfirmation[] = [];
  const surface = uiSurface(() => host, {
    quietMs: 1,
    settleMs: 50,
    ...(answer === undefined
      ? {}
      : {
          confirm: request => {
            asked.push(request);
            return answer(request);
          }
        })
  });
  const call = async (name: string, args: Record<string, unknown>) =>
    resultText(await surface.call(name, args, { agent: 'Claude Code' }));
  return { call, asked, deleted, saved, kept, note };
}

describe('a control that asks the person before an agent acts on it', () => {
  it('is marked in the outline, with what it is inside of and not what opted out', async () => {
    const { call } = screen(() => 'approved');
    const outline = await call('ui_snapshot', {});
    expect(outline).toMatch(/button "Delete" \[e\d+\] \(asks the person first\)/);
    expect(outline).toMatch(/textbox "Note" .*\(asks the person first\)/);
    expect(outline).toMatch(/button "Keep" \[e\d+\]$/m);
    expect(outline).toMatch(/button "Save" \[e\d+\]$/m);
  });

  it("puts a press to the person in the app's words, and presses only when they approve", async () => {
    let answer: AgentConfirmResult = 'declined';
    const { call, asked, deleted } = screen(() => answer);

    expect(await call('ui_press', { role: 'button', name: 'Delete' })).toBe(
      'The person declined pressing button "Delete". Do not send it again unless they ask.'
    );
    expect(deleted.value).toBe(0);
    expect(asked[0]).toEqual({
      channel: 'screen',
      command: 'press',
      arguments: { control: 'button "Delete"' },
      destructive: false,
      question: { title: 'Delete the expense "Bus fare"?' },
      agent: 'Claude Code'
    });

    answer = 'approved';
    await call('ui_press', { role: 'button', name: 'Delete' });
    expect(deleted.value).toBe(1);
  });

  it("asks before typing, in words written from the control's name, and says when nobody could be asked", async () => {
    const { call, asked, note } = screen(() => ({ unavailable: "the app's window is hidden" }));
    expect(await call('ui_type', { role: 'textbox', name: 'Note', text: 'hi' })).toContain(
      'Nobody could be asked to approve typing into textbox "Note": the app\'s window is hidden.'
    );
    expect(asked[0].question).toEqual({ title: 'Allow typing into textbox "Note"?' });
    expect(asked[0].arguments).toEqual({ control: 'textbox "Note"', text: 'hi' });
    expect(note.value).toBe('');
  });

  it('asks before a key that acts on a marked control, and not before one that moves focus', async () => {
    const { call, asked, deleted } = screen(() => 'declined');
    await call('ui_focus', { role: 'button', name: 'Delete' });
    expect(asked).toHaveLength(0);
    await call('ui_key', { key: 'Tab', shift: true });
    expect(asked).toHaveLength(0);
    await call('ui_focus', { role: 'button', name: 'Delete' });
    expect(await call('ui_key', { key: 'Enter' })).toContain('declined pressing Enter on button "Delete"');
    expect(deleted.value).toBe(0);
  });

  it('leaves everything else alone, and refuses a marked control when there is no way to ask', async () => {
    const { call, saved, kept, deleted } = screen();
    await call('ui_press', { role: 'button', name: 'Save' });
    await call('ui_press', { role: 'button', name: 'Keep' });
    expect([saved.value, kept.value]).toEqual([1, 1]);
    expect(await call('ui_press', { role: 'button', name: 'Delete' })).toContain(
      'has given agents no way to ask. Ask the person to do it themselves.'
    );
    expect(deleted.value).toBe(0);
  });
});
