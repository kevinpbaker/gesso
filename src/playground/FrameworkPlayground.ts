import { map } from 'rxjs';

import { Box, Button, Column, Row, Text } from '../ui/composition';
import type { UiElement } from '../ui/composition';
import { Component } from '../framework/Component';
import { createComponent } from '../framework/createComponent';
import { Define, Inject, Input } from '../framework/decorators';
import { state } from '../framework/State';
import { Store } from '../framework/store/Store';
import { Action, State } from '../framework/store/decorators';

/**
 * Demo store used by the framework playground.
 *
 * Owned by the single-thread app runtime and injected into components
 * with `@Inject()`. Actions are the only way to mutate store state.
 */
export class DemoStore extends Store {
  @State() clicks = state(0);

  @Action()
  increment(): void {
    this.clicks.value++;
  }
}

/**
 * A component that demonstrates local `@State()`.
 *
 * It starts a timer on mount that increments its own counter every
 * second, proving that component state emissions flow through the
 * framework binding pipeline to the canvas renderer.
 */
@Define('local-counter')
export class LocalCounter extends Component {
  @State() count = state(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  increment(): void {
    this.count.value++;
  }

  override onMount(): void {
    this.timer = setInterval(() => this.increment(), 1000);
  }

  override onUnmount(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  override render(): UiElement {
    return Row(
      { gap: 12, alignItems: 'center' },
      Text({
        text: this.count.pipe(map(c => `Local count: ${c}`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          text: '+',
          color: '#ffffff',
          backgroundColor: '#10b981',
          width: 40,
          height: 32,
          borderRadius: 4
        },
        Text({ text: '+' })
      )
    );
  }
}

/**
 * A component that demonstrates store injection and selectors.
 *
 * It starts a timer on mount that dispatches a store action every
 * second, proving that store changes reach the canvas through the
 * framework's reactive selector pipeline.
 */
@Define('store-counter')
export class StoreCounter extends Component {
  @Inject(DemoStore) demo!: DemoStore;

  private timer: ReturnType<typeof setInterval> | null = null;

  override onMount(): void {
    this.timer = setInterval(() => this.demo.dispatch('increment'), 1000);
  }

  override onUnmount(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  override render(): UiElement {
    return Row(
      { gap: 12, alignItems: 'center' },
      Text({
        text: this.demo.select(s => s.clicks.value).pipe(map(c => `Store count: ${c}`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          text: 'Add',
          color: '#ffffff',
          backgroundColor: '#1f6feb',
          width: 80,
          height: 32,
          borderRadius: 4
        },
        Text({ text: 'Add' })
      )
    );
  }
}

/**
 * A component rendered from inside an observable list.
 *
 * Instances of this class are created and destroyed by emissions of
 * the store selector below, which is the capability Phase A added:
 * before it, a component reaching UiGraphBuilder from inside an
 * observable child threw.
 */
@Define('tick-item')
export class TickItem extends Component {
  @Input() label = '';

  override render(): UiElement {
    return Row(
      { gap: 8, alignItems: 'center' },
      Box({ width: 10, height: 10, backgroundColor: '#38bdf8', borderRadius: 5 }),
      Text({ text: this.label, color: '#cbd5f5' })
    );
  }
}

/**
 * Root component for the framework playground.
 *
 * Composes static and dynamic content to verify that the framework
 * component runtime, store injection, local state, and Canvas2D
 * renderer all work together in a single-thread app.
 */
@Define('framework-demo-root')
export class FrameworkDemoRoot extends Component {
  @Inject(DemoStore) demo!: DemoStore;

  /**
   * The four most recent ticks, newest first, keyed by tick number.
   *
   * Every emission mounts one new component, unmounts the one that
   * fell off the end, and reorders the three that survived — so the
   * list exercises keyed component identity, not just creation.
   */
  private recentTicks() {
    return this.demo
      .select(s => s.clicks.value)
      .pipe(
        map(count => {
          const ticks: number[] = [];
          for (let tick = count; tick > count - 4 && tick > 0; tick--) {
            ticks.push(tick);
          }
          return ticks.map(tick => createComponent(TickItem, { label: `Tick #${tick}` }, tick) as unknown as UiElement);
        })
      );
  }

  override render(): UiElement {
    return Column(
      { padding: 24, gap: 20, alignItems: 'flex-start' },
      Text({ text: 'Framework Playground', color: '#ffffff', fontSize: 24, fontWeight: 600 }),
      Text({
        text: 'If this renders, createApp + components + Canvas2D is working.',
        color: '#9ca3af'
      }),
      Box({ width: 120, height: 120, backgroundColor: '#f59e0b', borderRadius: 8 }),
      createComponent(LocalCounter),
      createComponent(StoreCounter),
      Text({ text: 'Keyed components from an observable list:', color: '#9ca3af' }),
      Column({ gap: 6, alignItems: 'flex-start' }, this.recentTicks())
    );
  }
}
