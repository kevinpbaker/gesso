import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button, Column, Text, type CanvasHost } from 'gesso-core';

import { defineChannel } from '../channel/ChannelToken';
import { AGENT_PORT, remoteSurface } from '../agent/remote';
import { createSyncApp } from './createSyncApp';
import type { ModelContextLike } from '../agent/webmcp';

/**
 * The single-thread configuration, asked by an agent.
 *
 * There is no render worker here: the page draws, so the page answers
 * the agent port. The frame clock is the browser's, and in a spec its
 * frames never come, which is the background tab exactly: an action's
 * effect reaches the screen only because the tools run the pending
 * frame themselves.
 */

function mockCanvas(): CanvasHost {
  const ctx = new Proxy(
    { measureText: (text: string) => ({ width: String(text).length * 7 }) } as Record<string, unknown>,
    {
      get: (target, key) => target[key as string] ?? vi.fn()
    }
  );
  return { width: 400, height: 300, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

function mockHost(): HTMLElement {
  return { clientWidth: 400, clientHeight: 300, appendChild: vi.fn(), removeChild: vi.fn() } as unknown as HTMLElement;
}

const global = globalThis as { document?: unknown; requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };

beforeEach(() => {
  const canvas = mockCanvas();
  global.document = { createElement: () => canvas };
  // Frames are asked for and never delivered.
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
});

afterEach(() => {
  delete global.document;
  delete global.requestAnimationFrame;
  delete global.cancelAnimationFrame;
});

const Counter = defineChannel('counter', { view: { count: 0 }, commands: {} as { add(by: number): void } });

function counterApp() {
  const count = new BehaviorSubject(0);
  const builder = createSyncApp(
    Column(
      Text({ text: count.pipe(map(value => `Count ${value}`)) }),
      Button({
        text: 'Add one',
        onClick: () => count.next(count.value + 1)
      })
    )
  ).useChannel(Counter, {
    source: { view: { count }, commands: { add: (by: number) => count.next(count.value + by) } }
  });
  return { builder, count };
}

describe('a single-thread app, asked by an agent', () => {
  it('opens nothing before it is mounted', () => {
    expect(counterApp().builder.openRenderPort(AGENT_PORT)).toBeUndefined();
  });

  it('answers with its channels and its screen, from the page', async () => {
    const { builder, count } = counterApp();
    const unmount = builder.mountSync(mockHost());
    const agent = remoteSurface(builder.openRenderPort(AGENT_PORT)!);

    expect((await agent.tools()).map(tool => tool.name)).toEqual([
      'counter_view',
      'counter_add',
      'ui_snapshot',
      'ui_press',
      'ui_type',
      'ui_focus',
      'ui_key'
    ]);

    expect((await agent.call('counter_add', { arguments: [2] })).structuredContent).toEqual({ count: 2 });

    // No animation frame ever arrives, so this reads "Count 3" only
    // because the tool ran the pending frame itself.
    const pressed = await agent.call('ui_press', { role: 'button', name: 'Add one' });
    expect(count.value).toBe(3);
    expect(pressed.content[0].text).toContain('text "Count 3"');

    unmount();
  });

  it('opens only the agent port', () => {
    const { builder } = counterApp();
    const unmount = builder.mountSync(mockHost());
    expect(builder.openRenderPort('notes')).toBeUndefined();
    unmount();
  });

  it('registers with WebMCP once mounted when asked, and removes it all on unmount', async () => {
    const tools = new Map<string, unknown>();
    const modelContext: ModelContextLike = {
      registerTool: async (tool, options) => {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name));
      }
    };
    (global.document as { modelContext?: ModelContextLike }).modelContext = modelContext;

    const { builder } = counterApp();
    const unmount = builder.useWebMcp().mountSync(mockHost());
    await vi.waitFor(() => expect(tools.size).toBe(7));
    unmount();
    expect(tools.size).toBe(0);
  });
});
