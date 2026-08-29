import { map } from 'rxjs';

import { Box, Button, Column, LazyColumn, Row, ScrollView, Text } from '../ui/composition';
import type { UiNode } from '../ui/graph/UiNode';
import { OverlayStore } from '../framework/overlay/OverlayStore';
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
      { gap: 12, y: 'center' },
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
      { gap: 12, y: 'center' },
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
      { gap: 8, y: 'center' },
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
      { gap: 6, x: 'start' },
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
      { gap: 8, x: 'start' },
      Row(
        { gap: 12, y: 'center' },
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

/**
 * Overlays (roadmap L2): a menu anchored to a button through a `ref`,
 * opened through the OverlayStore. The button sits inside a short
 * scroll view near the bottom of the page, so the menu flips upward
 * when there is no room below and follows the button as the list
 * scrolls; a press anywhere else closes it.
 */
@Define('menu-demo')
export class MenuDemo extends Component {
  @Inject(OverlayStore) overlays!: OverlayStore;

  private anchor: UiNode | null = null;
  private noteAnchor: UiNode | null = null;
  private choice = state('Nothing chosen yet');

  /**
   * A popover with no backdrop: it stays open while the page and the
   * list scroll, and the engine keeps it beside its button.
   */
  private toggleNote(): void {
    if (this.overlays.isOpen('menu-demo-note')) {
      this.overlays.dispatch('close', 'menu-demo-note');
      return;
    }
    this.overlays.dispatch('open', {
      id: 'menu-demo-note',
      anchor: this.noteAnchor,
      placement: 'right-start',
      offset: 8,
      content: Column(
        { backgroundColor: '#3b2f0b', borderColor: '#a16207', borderWidth: 1, borderRadius: 6, padding: 8, width: 200 },
        Text({
          text: 'Pinned: no backdrop, so scrolling underneath keeps working and I follow my button.',
          color: '#fde68a',
          fontSize: 12
        })
      )
    });
  }

  private open(): void {
    this.overlays.dispatch('open', {
      id: 'menu-demo',
      anchor: this.anchor,
      placement: 'bottom-start',
      offset: 4,
      dismissOnOutsidePress: true,
      content: Column(
        {
          backgroundColor: '#1f2937',
          borderColor: '#374151',
          borderWidth: 1,
          borderRadius: 6,
          padding: 4,
          gap: 2,
          width: 180
        },
        ...['Rename', 'Duplicate', 'Move to…', 'Delete'].map(label =>
          Button({
            text: label,
            color: label === 'Delete' ? '#f87171' : '#e5e7eb',
            fontSize: 13,
            padding: 8,
            borderRadius: 4,
            onClick: () => {
              this.choice.value = `Chose “${label}”`;
              this.overlays.dispatch('close', 'menu-demo');
            }
          })
        )
      )
    });
  }

  override render(): UiElement {
    return Column(
      { gap: 8 },
      Text({ text: 'Anchored menu: opens below, flips up near the edge, follows the scroll.', color: '#9ca3af' }),
      Row(
        { gap: 12, y: 'center' },
        ScrollView(
          { width: 220, height: 72, backgroundColor: '#111827', borderRadius: 6, padding: 8, gap: 8 },
          Text({ text: 'Scroll me ↓', color: '#6b7280', fontSize: 12 }),
          Text({ text: 'The button is below.', color: '#6b7280', fontSize: 12 }),
          Button({
            ref: (node: UiNode | null) => {
              this.anchor = node;
            },
            text: 'Actions ▾',
            color: '#ffffff',
            backgroundColor: '#1f6feb',
            padding: 8,
            borderRadius: 4,
            onClick: () => this.open()
          }),
          Button({
            ref: (node: UiNode | null) => {
              this.noteAnchor = node;
            },
            text: 'Pin a note',
            color: '#fde68a',
            backgroundColor: '#3b2f0b',
            padding: 8,
            borderRadius: 4,
            onClick: () => this.toggleNote()
          }),
          Text({ text: 'More content underneath.', color: '#6b7280', fontSize: 12 })
        ),
        Text({ text: this.choice, color: '#d1d5db' })
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
/**
 * Overflow (roadmap L4): a rounded card clips a box that spills past
 * it, and a list with a sticky header scrolls under it while Tab moves
 * focus through rows that scroll themselves into view.
 */
@Define('scroll-demo')
export class ScrollDemo extends Component {
  override render(): UiElement {
    return Column(
      { gap: 8 },
      Text({
        text: 'Overflow: the rounded card clips; the list has a sticky header, overlay scrollbars, and Tab scrolls the focused row into view.',
        color: '#9ca3af'
      }),
      Row(
        { gap: 16, y: 'start' },
        Box(
          {
            width: 160,
            height: 100,
            overflow: 'hidden',
            borderRadius: 16,
            backgroundColor: '#111827',
            position: 'relative'
          },
          Box({
            position: 'absolute',
            left: -40,
            top: -30,
            width: 140,
            height: 140,
            backgroundColor: '#f59e0b',
            borderRadius: 70
          }),
          Box({
            position: 'absolute',
            left: 90,
            top: 40,
            width: 120,
            height: 120,
            backgroundColor: '#3b82f6',
            borderRadius: 60
          }),
          Text({ text: 'clipped', color: '#ffffff', fontSize: 12, position: 'absolute', left: 8, bottom: 8 })
        ),
        Column(
          { width: 220, height: 140, overflow: 'scroll', backgroundColor: '#111827', borderRadius: 6 },
          Row(
            { position: 'sticky', top: 0, padding: 6, backgroundColor: '#1f2937', flexShrink: 0 },
            Text({ text: 'Sticky header — Tab through the rows', color: '#e5e7eb', fontSize: 12 })
          ),
          ...Array.from({ length: 14 }, (_, i) =>
            Button({
              text: `Row ${i + 1}`,
              color: '#d1d5db',
              fontSize: 13,
              padding: 6,
              flexShrink: 0,
              backgroundColor: i % 2 === 0 ? '#0f172a' : '#111827'
            })
          )
        )
      )
    );
  }
}

/**
 * Virtualization (roadmap L5): a hundred thousand rows, of which only
 * the visible ones plus an overscan band exist as nodes. The status bar
 * shows layout cost staying flat while it scrolls.
 */
@Define('lazy-list-demo')
export class LazyListDemo extends Component {
  override render(): UiElement {
    const count = 100000;
    return Column(
      { gap: 8 },
      Text({ text: `LazyColumn: ${count.toLocaleString()} rows, only the visible ones are nodes.`, color: '#9ca3af' }),
      LazyColumn(
        { width: 360, height: 180, count, estimatedExtent: 28, backgroundColor: '#111827', borderRadius: 6 },
        index =>
          Row(
            { padding: 6, gap: 10, y: 'center', backgroundColor: index % 2 === 0 ? '#0f172a' : '#111827' },
            Box({ width: 12, height: 12, borderRadius: 6, backgroundColor: `hsl(${(index * 7) % 360} 70% 55%)` }),
            Text({ text: `Row ${index.toLocaleString()}`, color: '#d1d5db', fontSize: 13, flexGrow: 1 }),
            Text({ text: index % 3 === 0 ? 'three lines' : 'one', color: '#6b7280', fontSize: 11 })
          )
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
    // A scrolling page: content taller than the viewport scrolls instead
    // of being flex-shrunk into it, and the anchored menu below has to
    // follow its button through two nested scroll containers.
    return ScrollView(
      { padding: 24, gap: 20 },
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
      createComponent(MenuDemo),
      createComponent(ScrollDemo),
      createComponent(LazyListDemo),
      Text({ text: 'Keyed components from an observable list (click Add):', color: '#9ca3af' }),
      Column({ gap: 6, x: 'start' }, this.recentTicks())
    );
  }
}
