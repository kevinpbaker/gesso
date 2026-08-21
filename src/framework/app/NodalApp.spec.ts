import { describe, expect, it, vi } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { NodalApp } from './NodalApp';
import { Store } from '../store/Store';
import { state } from '../State';
import { State as StateDecorator, Action } from '../store/decorators';
import { Text } from '../../ui/composition/UiComponents';
import { UiTimerFrameClock } from '../../ui/scheduler';
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
    measureText: vi.fn(() => ({ width: 0 })),
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

class CounterStore extends Store {
  @StateDecorator() count = state(0);

  @Action()
  increment() {
    this.count.value++;
  }
}

@Define('counter-view')
class CounterView extends Component {
  @Inject(CounterStore) store!: CounterStore;

  override render() {
    return Text({ text: `Count: ${this.store.select(s => s.count.value)}` });
  }
}

describe('NodalApp', () => {
  it('mounts a component and registers stores', () => {
    const host = createMockHost();
    const canvas = createMockCanvas();
    const app = new NodalApp({
      host,
      root: createComponent(CounterView),
      storeClasses: [CounterStore],
      canvas,
      clock: callback => new UiTimerFrameClock(callback)
    });

    expect(app.stores.has(CounterStore)).toBe(true);

    app.mount();

    app.dispose();
  });
});
