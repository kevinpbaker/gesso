import { map } from 'rxjs';

import { Box, Button, Column, Row, Text } from '../ui/composition';
import type { UiElement } from '../ui/composition';
import { Component } from '../framework/Component';
import { createComponent } from '../framework/createComponent';
import { Define, Inject, Input } from '../framework/decorators';
import { state } from '../framework/State';
import { input } from '../framework/Input';
import { Store } from '../framework/store/Store';
import { Action, Projection, State } from '../framework/store/decorators';
import { HeavyStore } from './HeavyStore';

/**
 * Demo store used by the framework playground.
 *
 * Owned by the single-thread app runtime and injected into components
 * with `@Inject()`. Actions are the only way to mutate store state.
 */
export class DemoStore extends Store {
  @State() clicks = state(0);

  /**
   * Derived read model. Exposed to components as an Observable that
   * emits only when the projected value actually changes, which is
   * what a data worker will send over the wire in Phase E.
   */
  @Projection()
  get summary(): { clicks: number; parity: string } {
    return {
      clicks: this.clicks.value,
      parity: this.clicks.value % 2 === 0 ? 'even' : 'odd'
    };
  }

  @Action()
  increment(): void {
    this.clicks.value++;
  }
}

/**
 * A component that demonstrates local `@State()` driven by a click.
 *
 * The button carries a declarative `onClick` prop, so the handler is
 * registered on the input dispatcher during reconciliation. Pressing
 * it mutates local state, whose emission flows through the binding
 * pipeline to the canvas with no re-render.
 */
@Define('local-counter')
export class LocalCounter extends Component {
  @State() count = state(0);

  increment(): void {
    this.count.value++;
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
          onClick: () => this.increment(),
          color: '#ffffff',
          backgroundColor: '#10b981',
          width: 44,
          height: 32,
          borderRadius: 4
        },
        Text({ text: '+1', color: '#ffffff' })
      )
    );
  }
}

/**
 * A component that demonstrates store injection and dispatched actions.
 *
 * Clicking dispatches a store action; the store's state emission
 * reaches this component's text binding and the keyed list below
 * through the same selector pipeline.
 */
@Define('store-counter')
export class StoreCounter extends Component {
  @Inject(DemoStore) demo!: DemoStore;

  override render(): UiElement {
    return Row(
      { gap: 12, alignItems: 'center' },
      Text({
        text: this.demo.projection.summary.pipe(map(s => `Store count: ${s.clicks} (${s.parity})`)),
        color: '#e5e7eb'
      }),
      Button(
        {
          onClick: () => this.demo.dispatch('increment'),
          color: '#ffffff',
          backgroundColor: '#1f6feb',
          width: 80,
          height: 32,
          borderRadius: 4
        },
        Text({ text: 'Add', color: '#ffffff' })
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
  @Input() label = input('');

  override render(): UiElement {
    return Row(
      { gap: 8, alignItems: 'center' },
      Box({ width: 10, height: 10, backgroundColor: '#38bdf8', borderRadius: 5 }),
      Text({ text: this.label, color: '#cbd5f5' })
    );
  }
}

/**
 * A component that animates continuously from a timer it owns.
 *
 * The timer runs on whichever thread the component runtime lives on.
 * In the worker configuration that is the render worker, so blocking
 * the main thread leaves this ticking; in the single-thread
 * configuration it freezes along with everything else. That contrast
 * is the whole point of the two routes.
 */
@Define('heartbeat')
export class Heartbeat extends Component {
  @State() ticks = state(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  override onMount(): void {
    this.timer = setInterval(() => {
      this.ticks.value++;
    }, 100);
  }

  override onUnmount(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  override render(): UiElement {
    return Column(
      { gap: 6, alignItems: 'flex-start' },
      Text({
        text: this.ticks.pipe(map(t => `Heartbeat: ${t} (10/sec while the UI thread is free)`)),
        color: '#e5e7eb'
      }),
      Box({
        // A bar that sweeps back and forth, so a stalled frame is
        // obvious at a glance rather than needing a number read.
        width: this.ticks.pipe(map(t => 40 + Math.abs(((t % 60) - 30) * 8))),
        height: 12,
        backgroundColor: '#38bdf8',
        borderRadius: 6
      })
    );
  }
}

/**
 * Drives a store that lives in a data worker.
 *
 * The button dispatches an action that burns 1.5 seconds of CPU. It
 * runs in the data worker, so neither this thread nor the main thread
 * notices: the heartbeat above keeps its cadence throughout.
 */
@Define('heavy-panel')
export class HeavyPanel extends Component {
  @Inject(HeavyStore) heavy!: HeavyStore;

  override render(): UiElement {
    return Column(
      { gap: 8, alignItems: 'flex-start' },
      Row(
        { gap: 12, alignItems: 'center' },
        Text({
          text: this.heavy.projection.status.pipe(
            map(status =>
              status === undefined
                ? 'Data worker: connecting…'
                : `Data worker: ${status.runs} runs · checksum ${status.checksum} · last ${status.lastDurationMs}ms`
            )
          ),
          color: '#e5e7eb'
        }),
        Button(
          {
            onClick: () => this.heavy.dispatch('compute'),
            color: '#ffffff',
            backgroundColor: '#a855f7',
            width: 150,
            height: 32,
            borderRadius: 4
          },
          Text({ text: 'Burn 1.5s', color: '#ffffff' })
        )
      )
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
@Define('text-showcase')
export class TextShowcase extends Component {
  /**
   * Text as a layout citizen (roadmap L1), in one card: a title clamped
   * to two lines with an ellipsis, a paragraph that wraps at the card's
   * content width, and a label/value row whose different font sizes
   * share a baseline.
   */
  override render(): UiElement {
    return Column(
      {
        width: 340,
        padding: 16,
        gap: 10,
        backgroundColor: '#1f2937',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#374151'
      },
      Text({
        text: 'A title long enough that it cannot possibly fit on two lines of this card, so it is clamped with an ellipsis',
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 600,
        maxLines: 2,
        textOverflow: 'ellipsis'
      }),
      Text({
        text: "Text now wraps at the width layout gives it. Flex measures items at max-content for their base size, resolves the main axis, and measures again at the final size, so this paragraph's height is known before the card is placed.",
        color: '#d1d5db',
        fontSize: 13
      }),
      Row(
        { gap: 8, y: 'baseline' },
        Text({ text: 'Frame', color: '#9ca3af', fontSize: 12 }),
        Text({ text: '2.4 ms', color: '#ffffff', fontSize: 24, fontWeight: 600 }),
        Text({ text: 'worst 4.1 ms', color: '#9ca3af', fontSize: 12 })
      )
    );
  }
}

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
        text: 'Click the buttons: input, components, stores and Canvas2D are wired end to end.',
        color: '#9ca3af'
      }),
      Box({ width: 120, height: 120, backgroundColor: '#f59e0b', borderRadius: 8 }),
      createComponent(TextShowcase),
      createComponent(LocalCounter),
      createComponent(StoreCounter),
      createComponent(Heartbeat),
      createComponent(HeavyPanel),
      Text({ text: 'Keyed components from an observable list (click Add):', color: '#9ca3af' }),
      Column({ gap: 6, alignItems: 'flex-start' }, this.recentTicks())
    );
  }
}
