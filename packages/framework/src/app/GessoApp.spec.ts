import { describe, expect, it, vi } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { GessoApp, type GessoAppOptions } from './GessoApp';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { internalState } from '../InternalState';
import {
  Box,
  Column,
  Text,
  type UiChild,
  type UiElement,
  type UiNode,
  UiNodeType,
  UiManualFrameClock,
  UiTimerFrameClock,
  type CanvasHost
} from 'gesso-core';
import { FakePlatformSurface } from 'gesso-core/testing';
import { internalState as cell } from '../InternalState';
import { input } from '../Input';
import { Input } from '../decorators';
import { map } from 'rxjs/operators';
import { route } from '../router/RouteDefinition';
import { RouterService } from '../router/RouterService';
import type { ShellHistory } from './shellHistory';

function createMockCanvas(width = 600, height = 600): CanvasHost {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    // A real canvas never measures non-empty text as zero-width, and
    // a zero-width glyph run is indistinguishable from 'nothing drawn'.
    measureText: vi.fn((text: string) => ({ width: String(text).length * 7 })),
    drawImage: vi.fn(),
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '14px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
  return {
    width,
    height,
    getContext: () => ctx as unknown as CanvasRenderingContext2D
  };
}

function createMockHost(): HTMLElement {
  return {
    clientWidth: 600,
    clientHeight: 600,
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    querySelector: vi.fn()
  } as unknown as HTMLElement;
}

/**
 * A service standing in for shared state a component reads.
 *
 * A plain class with a public cell and public methods: same thread,
 * so nothing here needs a projection, a dispatch or a wire format.
 */
class CounterService {
  readonly count = internalState(0);

  increment() {
    this.count.value++;
  }

  decrement() {
    this.count.value--;
  }
}

@Define('counter-view')
class CounterView extends Component {
  @Inject(CounterService) counter!: CounterService;

  override render() {
    return Text({ text: this.counter.count.pipe(map(count => `Count: ${count}`)) });
  }
}

const itemMounts: string[] = [];
const itemUnmounts: string[] = [];

@Define('list-item')
class ListItem extends Component {
  @Input() label = input('');

  override onMount() {
    itemMounts.push(this.label.value);
  }

  override onUnmount() {
    itemUnmounts.push(this.label.value);
  }

  override render() {
    return Text({ text: this.label });
  }
}

@Define('list-root')
class ListRoot extends Component {
  @Inject(CounterService) counter!: CounterService;

  override render(): UiChild {
    return Column(
      this.counter.count.pipe(
        map(count => {
          const labels: string[] = [];
          for (let i = 1; i <= count; i++) {
            labels.push(`item-${i}`);
          }
          return labels.map(label => createComponent(ListItem, { label }, label) as unknown as UiElement);
        })
      )
    );
  }
}

@Define('click-counter')
class ClickCounter extends Component {
  readonly count = cell(0);

  override render() {
    return Column(
      Text({ text: this.count.pipe(map(c => `clicks: ${c}`)) }),
      Box({
        width: 100,
        height: 40,
        onClick: () => {
          this.count.value++;
        }
      })
    );
  }
}

/** Text values of the tree in order, with Fragment anchors expanded. */
function collectText(node: UiNode, into: string[] = []): string[] {
  if (node.type === UiNodeType.Text) {
    into.push(String(node.getProperty('text')));
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    collectText(child, into);
  }
  return into;
}

describe('GessoApp', () => {
  it('mounts a component and resolves an injected service', () => {
    const host = createMockHost();
    const canvas = createMockCanvas();
    const services = new ServiceRegistry();
    services.register(CounterService);
    const app = new GessoApp({
      host,
      root: createComponent(CounterView),
      services,
      canvas,
      clock: callback => new UiTimerFrameClock(callback)
    });

    expect(services.has(CounterService)).toBe(true);

    app.mount();

    app.dispose();
  });

  it('mounts and unmounts components emitted by an observable list', () => {
    itemMounts.length = 0;
    itemUnmounts.length = 0;
    const services = new ServiceRegistry();
    services.register(CounterService);

    const app = new GessoApp({
      host: createMockHost(),
      canvas: createMockCanvas(),
      root: createComponent(ListRoot),
      services,
      clock: callback => new UiTimerFrameClock(callback)
    });

    const counter = services.get(CounterService);
    const root = app.debugRoot();

    expect(collectText(root)).toEqual([]);

    counter.increment();
    counter.increment();
    expect(collectText(root)).toEqual(['item-1', 'item-2']);
    expect(itemMounts).toEqual(['item-1', 'item-2']);

    counter.decrement();
    expect(collectText(root)).toEqual(['item-1']);
    expect(itemUnmounts).toEqual(['item-2']);

    app.dispose();
  });

  it('routes a real click through hit-testing into a component handler', () => {
    const app = new GessoApp({
      host: createMockHost(),
      canvas: createMockCanvas(),
      root: createComponent(ClickCounter),
      clock: callback => new UiTimerFrameClock(callback)
    });

    app.mount();

    const root = app.debugRoot();
    expect(collectText(root)).toEqual(['clicks: 0']);

    // Drive the same adapter the DOM would, so the click travels the
    // full path: surface -> pointer controller -> hit test -> Click
    // synthesis -> dispatcher -> onClick -> state -> node property.
    const surface = new FakePlatformSurface();
    app.input.attach(surface);

    // The Box sits below the text line, inside its 100x40 box.
    surface.localX = 20;
    surface.localY = 30;
    surface.pointerTarget.emit('pointerdown', {
      clientX: 20,
      clientY: 30,
      buttons: 1,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {}
    } as unknown as Event);
    surface.pointerTarget.emit('pointerup', {
      clientX: 20,
      clientY: 30,
      buttons: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {}
    } as unknown as Event);

    expect(collectText(root)).toEqual(['clicks: 1']);

    app.dispose();
  });

  describe('surface sizing', () => {
    function mountWithManualClock() {
      let clock: UiManualFrameClock | undefined;
      const canvas = createMockCanvas();
      const app = new GessoApp({
        host: createMockHost(),
        canvas,
        root: createComponent(ClickCounter),
        clock: callback => {
          clock = new UiManualFrameClock(callback);
          return clock;
        }
      });
      app.mount();
      return { app, canvas, clock: clock! };
    }

    it('paints on the first frame', () => {
      const { canvas, clock } = mountWithManualClock();
      const ctx = canvas.getContext('2d') as unknown as { fillText: ReturnType<typeof vi.fn> };

      expect(clock.isPending).toBe(true);
      clock.tick(0);

      expect(ctx.fillText.mock.calls.length).toBeGreaterThan(0);
    });

    it('repaints in the same task that resizes the surface', () => {
      // Resizing the backing store clears it, and the cleared surface
      // is committed to the compositor at the end of this task. A
      // repaint left to the next tick therefore showed one blank frame
      // per resize notification, which reads as flicker while dragging.
      const { app, canvas, clock } = mountWithManualClock();
      clock.tick(0);
      expect(clock.isPending).toBe(false);

      const ctx = canvas.getContext('2d') as unknown as { fillText: ReturnType<typeof vi.fn> };
      ctx.fillText.mockClear();

      app.resize(900, 700);

      expect(ctx.fillText.mock.calls.length).toBeGreaterThan(0);
      // And exactly one paint: the flushed frame is not left pending
      // for the clock to draw a second time.
      expect(clock.isPending).toBe(false);
    });

    it('ignores a zero-sized report rather than blanking the surface', () => {
      // A hidden or detached host reports 0x0. A zero logical size makes
      // the renderer's cull rectangle empty, discarding every node.
      const { app, canvas, clock } = mountWithManualClock();
      clock.tick(0);

      app.resize(0, 0);
      expect(clock.isPending).toBe(false);

      const ctx = canvas.getContext('2d') as unknown as { fillText: ReturnType<typeof vi.fn> };
      ctx.fillText.mockClear();
      app.resize(900, 700);

      expect(ctx.fillText.mock.calls.length).toBeGreaterThan(0);
    });
  });

  /**
   * A history the app was handed rather than one it made from options:
   * what an app embedded in another product's page passes, because the
   * address bar belongs to the host and is reachable only through the
   * host's own history object.
   */
  describe('a history passed in ready-made', () => {
    const Inbox = route({ path: '/mail', component: () => Text({ text: 'Inbox' }) });
    const Message = route({ path: '/mail/:id', component: () => Text({ text: 'Message' }) });
    const routes = { routes: [Inbox, Message] };

    /** A host's history: records what it was asked, and can report a change. */
    function hostHistory(initialUrl: string) {
      let current = initialUrl;
      let listener: ((url: string) => void) | null = null;
      const calls: string[] = [];
      const history: ShellHistory = {
        get url() {
          return current;
        },
        push: url => {
          calls.push(`push ${url}`);
          current = url;
        },
        replace: url => {
          calls.push(`replace ${url}`);
          current = url;
        },
        back: () => calls.push('back'),
        forward: () => calls.push('forward'),
        onChange: next => {
          listener = next;
        },
        dispose: () => calls.push('dispose')
      };
      return {
        history,
        calls,
        /** What the host does when the person presses its back button. */
        report: (url: string) => {
          current = url;
          listener?.(url);
        }
      };
    }

    function mountWith(history: GessoAppOptions['history']) {
      const app = new GessoApp({
        host: createMockHost(),
        canvas: createMockCanvas(),
        root: Text({ text: 'App' }),
        routes,
        history,
        clock: callback => new UiTimerFrameClock(callback)
      });
      app.mount();
      return { app, router: app.services.get(RouterService) };
    }

    it('starts the router at the url the host reports', () => {
      const host = hostHistory('/mail/7');
      const { app, router } = mountWith(host.history);

      expect(router.url.value).toBe('/mail/7');
      expect(router.match.value?.params).toEqual({ id: '7' });
      app.dispose();
    });

    it('writes navigation to the host, pushing or replacing as the router asked', () => {
      const host = hostHistory('/mail');
      const { app, router } = mountWith(host.history);

      router.go(Message, { id: '3' });
      router.navigate('/mail/4', { replace: true });
      router.back();

      expect(host.calls).toEqual(['push /mail/3', 'replace /mail/4', 'back']);
      app.dispose();
    });

    it('follows the urls the host reports', () => {
      const host = hostHistory('/mail/3');
      const { app, router } = mountWith(host.history);

      host.report('/mail');

      expect(router.url.value).toBe('/mail');
      app.dispose();
    });

    it('leaves it undisposed, and stops listening to it, when the app goes', () => {
      const host = hostHistory('/mail');
      const { app, router } = mountWith(host.history);

      app.dispose();
      host.report('/mail/9');

      expect(host.calls).not.toContain('dispose');
      expect(router.url.value).toBe('/mail');
    });

    it('still makes its own from options', () => {
      const { app, router } = mountWith({ mode: 'memory', initialUrl: '/mail/5' });

      expect(router.url.value).toBe('/mail/5');
      app.dispose();
    });
  });
});
