import { describe, expect, it, vi } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { GessoApp } from './GessoApp';
import { ServiceRegistry } from '../service/ServiceRegistry';
import { internalState } from '../InternalState';
import { Box, Column, Text } from '../../ui/composition/UiComponents';
import { FakePlatformSurface } from '../../ui/input/UiInputTestUtils';
import { internalState as cell } from '../InternalState';
import { input } from '../Input';
import type { UiChild, UiElement } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { Input } from '../decorators';
import { map } from 'rxjs/operators';
import { UiManualFrameClock, UiTimerFrameClock } from '../../ui/scheduler';
import type { CanvasHost } from '../../ui/rendering';

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
});
