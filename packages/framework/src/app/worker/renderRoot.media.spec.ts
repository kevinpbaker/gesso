import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DefaultImageResolver,
  IconRasterizer,
  Text,
  type CanvasHost,
  type ImageResolver,
  type UiChild,
  type VideoResolver
} from '@gesso/core';

import { Component } from '../../Component';
import { Define, Inject } from '../../decorators';
import { createComponent } from '../../createComponent';
import { MediaService } from '../MediaService';
import { RenderWorkerApp } from './renderRoot';
import type { RuntimeToShellMessage, ShellToRuntimeMessage } from './RenderWorkerProtocol';

/**
 * The `media` option, in the render worker.
 *
 * It is declared here rather than in the shell's `createApp` options
 * because a resolver is a function and no function crosses a
 * `postMessage`. The worker entry is the first code in the thread that
 * will hold the tree, which makes it the only honest place to build
 * one; `renderRoot(Root).useMedia(...)` is that seam.
 */

function createMockCanvas(width = 800, height = 600): CanvasHost {
  const ctx: Record<string, unknown> = {};
  for (const method of ['save', 'restore', 'setTransform', 'clearRect', 'fillRect', 'beginPath', 'fill', 'fillText']) {
    ctx[method] = vi.fn();
  }
  ctx.measureText = vi.fn((text: string) => ({ width: String(text).length * 7 }));
  return { width, height, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

function createFakeWorkerGlobal() {
  const sent: RuntimeToShellMessage[] = [];
  const host = {
    onmessage: null as ((event: MessageEvent<ShellToRuntimeMessage>) => void) | null,
    postMessage: (message: RuntimeToShellMessage) => sent.push(message),
    addEventListener: () => {}
  };
  const send = (message: ShellToRuntimeMessage): void => {
    host.onmessage?.({ data: message } as MessageEvent<ShellToRuntimeMessage>);
  };
  return { host, sent, send };
}

function initMessage(canvas: CanvasHost): ShellToRuntimeMessage {
  return { type: 'init', canvas: canvas as unknown as OffscreenCanvas, width: 800, height: 600, dpr: 2 };
}

/** What the media store held when the first component body ran. */
const seen: { images?: ImageResolver; icons?: IconRasterizer; videos?: VideoResolver } = {};

@Define('worker-media-probe')
class MediaProbe extends Component {
  @Inject(MediaService) media!: MediaService;

  override render(): UiChild {
    seen.images = this.media.images;
    seen.icons = this.media.icons;
    seen.videos = this.media.videos;
    return Text({ text: 'probe' });
  }
}

function stubResolver(): ImageResolver {
  return new DefaultImageResolver({
    fetch: () => Promise.resolve(new Blob()),
    decode: () => Promise.reject(new Error('nothing decodes in a spec'))
  });
}

function stubVideoResolver(): VideoResolver {
  return {
    resolve: () => Promise.reject(new Error('nothing decodes in a spec')),
    release: () => {},
    dispose: () => {}
  };
}

afterEach(() => {
  seen.images = undefined;
  seen.icons = undefined;
  seen.videos = undefined;
});

describe('renderRoot().useMedia', () => {
  it('has the resolver, rasteriser and decoder in place before the first body runs', () => {
    const { host, send } = createFakeWorkerGlobal();
    const resolver = stubResolver();
    const rasterizer = new IconRasterizer();
    const videoResolver = stubVideoResolver();
    new RenderWorkerApp(createComponent(MediaProbe), host).useMedia({ resolver, rasterizer, videoResolver });

    send(initMessage(createMockCanvas()));

    // The tree is built inside the runtime's constructor, which `init`
    // is what triggers, so this is the earliest an `Image` could ask.
    expect(seen.images).toBe(resolver);
    expect(seen.icons).toBe(rasterizer);
    expect(seen.videos).toBe(videoResolver);
  });

  it('leaves the defaults in place for a worker that declares nothing', () => {
    const { host, send } = createFakeWorkerGlobal();
    new RenderWorkerApp(createComponent(MediaProbe), host);

    send(initMessage(createMockCanvas()));

    expect(seen.images).toBeInstanceOf(DefaultImageResolver);
    expect(seen.icons).toBeInstanceOf(IconRasterizer);
  });

  it('refuses a declaration made after the runtime started, as the other registrations do', () => {
    const { host, send } = createFakeWorkerGlobal();
    const app = new RenderWorkerApp(createComponent(MediaProbe), host);
    send(initMessage(createMockCanvas()));

    // Silently keeping it would be worse than refusing it: the tree
    // already exists, so the resolver has missed the first screen and
    // the pictures on it would come from somewhere the caller never
    // named. `useChannel` and `useRoutes` refuse the same way.
    expect(() => app.useMedia({ resolver: stubResolver() })).toThrow(/after the runtime started/);
  });
});
