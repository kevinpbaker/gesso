import { describe, expect, it, vi } from 'vitest';

import { Component } from '../Component';
import { Define, Inject } from '../decorators';
import { createComponent } from '../createComponent';
import { NodalApp } from './NodalApp';
import { Store } from '../store/Store';
import { state } from '../State';
import { State as StateDecorator, Action } from '../store/decorators';
import { Column, Text } from '../../ui/composition/UiComponents';
import type { UiChild, UiElement } from '../../ui/composition/UiElement';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { Input } from '../decorators';
import { map } from 'rxjs/operators';
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

  @Action()
  decrement() {
    this.count.value--;
  }
}

@Define('counter-view')
class CounterView extends Component {
  @Inject(CounterStore) store!: CounterStore;

  override render() {
    return Text({ text: `Count: ${this.store.select(s => s.count.value)}` });
  }
}

const itemMounts: string[] = [];
const itemUnmounts: string[] = [];

@Define('list-item')
class ListItem extends Component {
  @Input() label = '';

  override onMount() {
    itemMounts.push(this.label);
  }

  override onUnmount() {
    itemUnmounts.push(this.label);
  }

  override render() {
    return Text({ text: this.label });
  }
}

@Define('list-root')
class ListRoot extends Component {
  @Inject(CounterStore) store!: CounterStore;

  override render(): UiChild {
    return Column(
      this.store
        .select(s => s.count.value)
        .pipe(
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

  it('mounts and unmounts components emitted by an observable list', () => {
    itemMounts.length = 0;
    itemUnmounts.length = 0;

    const app = new NodalApp({
      host: createMockHost(),
      canvas: createMockCanvas(),
      root: createComponent(ListRoot),
      storeClasses: [CounterStore],
      clock: callback => new UiTimerFrameClock(callback)
    });

    const store = app.stores.get(CounterStore);
    const root = app.debugRoot();

    expect(collectText(root)).toEqual([]);

    store.dispatch('increment');
    store.dispatch('increment');
    expect(collectText(root)).toEqual(['item-1', 'item-2']);
    expect(itemMounts).toEqual(['item-1', 'item-2']);

    store.dispatch('decrement');
    expect(collectText(root)).toEqual(['item-1']);
    expect(itemUnmounts).toEqual(['item-2']);

    app.dispose();
  });
});
