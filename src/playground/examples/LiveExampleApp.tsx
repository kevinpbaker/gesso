import { BehaviorSubject, combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { ComponentContext, Inputs } from '../../framework/FunctionComponent';
import { internalState } from '../../framework/InternalState';

/**
 * Live: an operations board fed by a stream that never stops.
 *
 * Every Nodal prop accepts an Observable as well as a value. When the
 * Observable emits, that one property changes on that one node and the
 * next frame is drawn from it. The component that produced the node
 * does not run again, the tree is not diffed, and nothing is created,
 * moved or destroyed. This example exists to make that visible at a
 * scale where it could not be faked: three channels, forty bars each,
 * a rolling event log and a saturation meter, all sampled up to three
 * hundred and sixty times a second and adding up to tens of thousands
 * of property updates per second — over a tree that is built exactly
 * once.
 *
 * The panel on the left is the proof. `Property updates / second` is
 * measured by the feed; `Component bodies run` is the number of
 * component functions this page has ever executed, captured once the
 * tree was mounted. The first climbs into the thousands; the second
 * never moves again.
 *
 * Three things worth reading for:
 *
 *   - All four kinds of binding are here, and they cost different
 *     amounts. `text` is a content binding; a bar's `height` and the
 *     meter's `flexGrow` are layout bindings, so they re-run layout;
 *     `backgroundColor` and `opacity` are paint bindings, which do
 *     not; the scanner's `transform` is neither, and moves without
 *     touching layout or the node's paint properties.
 *   - Fan-out is free. A channel's forty bars all bind their colour to
 *     the same `colour$` subject, so a threshold crossing repaints
 *     forty nodes from one `next()` — with no list to re-render.
 *   - The event log is eight rows that are never rebuilt. A new event
 *     does not push a node into a list; it is written through the
 *     eight rows' bindings, so the log scrolls while the tree stands
 *     still. That is the trick a virtualized list plays, done by hand
 *     in a dozen lines.
 *
 * A note on the rates: they are sampling rates, not frame rates. A
 * render worker has no requestAnimationFrame tied to the compositor,
 * so `UiTimerFrameClock` arms the next frame with a 16 ms timeout once
 * the last one is done — which puts the ceiling just under 60 fps, and
 * makes a 60 Hz feed alias against it down to about 30. That is not a
 * dropped update: the graph is retained, so several emissions between
 * two frames simply coalesce, and the frame paints the latest value of
 * every binding. Watch `Property updates / second` against the FPS in
 * the status bar to see the two rates come apart.
 *
 * The rates above 60 Hz exist to push that gap as far as it goes: at
 * 360 Hz the feed takes six samples for every frame the clock can
 * paint, and the board is still never stale, because a bound property
 * has no queue to fall behind in — it holds one value, the latest.
 * Those rates are reached by taking more than one sample per timer
 * firing; `restart` explains why the timer alone cannot get there.
 *
 * The store holds only the controls — running, and the tick rate —
 * because those are app state a projection should carry. The stream
 * itself is a set of plain `BehaviorSubject`s bound straight into
 * props: pushing sixty samples a second through a store projection
 * would recompute and structurally compare a view model every frame,
 * to deliver numbers that each have exactly one reader.
 */

// ---------------------------------------------------------------------------
// Palette. This board sets its own colours rather than naming theme
// entries; #example-theme is the example about themes.
// ---------------------------------------------------------------------------

const BG = '#080d16';
const PANEL = '#0e1626';
const CARD = '#111b2c';
const CARD_ALT = '#0c1524';
const BORDER = '#1d2a41';
const BORDER_SOFT = '#172234';
const TRACK = '#18233a';
const TEXT = '#e6edf3';
const MUTED = '#8b98a9';
const FAINT = '#5c6a7d';
const ACCENT = '#3d8bfd';
const GOOD = '#2ea88a';
const WARN = '#e3a008';
const BAD = '#e5534b';
const MONO = 'ui-monospace, monospace';

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/** Samples kept on screen per channel, and so bars per sparkline. */
const WINDOW = 40;
/** Rows in the event log. Fixed: the log rotates through them. */
const LOG_ROWS = 8;
/** Steps the scanner takes across its track before turning around. */
const SWEEP_STEPS = 28;
/** How long an injected spike takes to decay, in ticks. */
const SPIKE_TICKS = 45;
/** Fraction of its threshold a channel must fall back to before it clears. */
const RECOVER_AT = 0.9;

const BAR_MIN = 3;
const BAR_MAX = 46;

export type RateName = 'calm' | 'live' | 'flood' | 'surge' | 'torrent' | 'deluge';

export const RATES: Record<RateName, { readonly label: string; readonly hz: number }> = {
  calm: { label: '4 Hz', hz: 4 },
  live: { label: '20 Hz', hz: 20 },
  flood: { label: '60 Hz', hz: 60 },
  surge: { label: '120 Hz', hz: 120 },
  torrent: { label: '240 Hz', hz: 240 },
  deluge: { label: '360 Hz', hz: 360 }
};

/**
 * How the rate buttons sit in the rail. Six across one 306 px column
 * would leave each one narrower than its own label, so the rail lays
 * them out as two rows of three.
 */
export const RATE_ROWS: readonly (readonly RateName[])[] = [
  ['calm', 'live', 'flood'],
  ['surge', 'torrent', 'deluge']
];

export const RATE_ORDER: readonly RateName[] = RATE_ROWS.flat();

/**
 * The fastest a repeating timer is worth asking for. Browsers clamp
 * `setInterval` to 4 ms once it has fired a few times, so an interval
 * below that buys nothing; the feed makes up the difference by taking
 * a batch of samples per firing instead.
 */
const MAX_TIMER_HZ = 200;

export interface ChannelSpec {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly colour: string;
  /** The value the channel wanders around. */
  readonly base: number;
  /** How far a quiet channel wanders from `base`. */
  readonly swing: number;
  /** Above this the channel is in trouble: it turns red and files an event. */
  readonly warnAbove: number;
  /** Decimal places in the headline number. */
  readonly digits: number;
  /** Whether a rise is good news, which decides the colour of the delta. */
  readonly upIsGood: boolean;
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'throughput',
    name: 'Throughput',
    unit: 'req/s',
    colour: '#3d8bfd',
    base: 2400,
    swing: 260,
    warnAbove: 3400,
    digits: 0,
    upIsGood: true
  },
  {
    id: 'latency',
    name: 'p95 latency',
    unit: 'ms',
    colour: '#a78bfa',
    base: 74,
    swing: 11,
    warnAbove: 104,
    digits: 1,
    upIsGood: false
  },
  {
    id: 'errors',
    name: 'Error rate',
    unit: '%',
    colour: '#38bdf8',
    base: 0.62,
    swing: 0.16,
    warnAbove: 1.25,
    digits: 2,
    upIsGood: false
  }
];

/** Whether a channel just crossed its threshold, and in which direction. */
export type Crossing = 'up' | 'down' | null;

export interface AdvanceResult {
  /** Bound properties this sample moved, for the updates-per-second readout. */
  readonly emits: number;
  readonly crossing: Crossing;
}

/**
 * A small deterministic generator, so the board behaves the same on
 * every run and a test can assert on real numbers.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatValue(spec: ChannelSpec, value: number): string {
  return spec.digits === 0 ? formatCount(value) : value.toFixed(spec.digits);
}

function clockText(at: number): string {
  const time = new Date(at);
  return [time.getHours(), time.getMinutes(), time.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');
}

/**
 * One channel of the feed: a rolling window of samples, and one
 * `BehaviorSubject` per bound property drawn from it.
 *
 * The subjects are the whole interface. Nothing here knows what a
 * component is, and no component below knows where the numbers come
 * from — they meet only where a prop is handed an Observable.
 */
export class LiveChannel {
  /** One per bar, bound to that bar's `height`. */
  readonly heights: readonly BehaviorSubject<number>[];
  /** Bound by all forty bars at once, so one push repaints the chart. */
  readonly colour$: BehaviorSubject<string>;
  readonly warn$ = new BehaviorSubject(false);
  readonly value$: BehaviorSubject<number>;
  readonly delta$ = new BehaviorSubject(0);
  readonly rangeText$ = new BehaviorSubject('');

  readonly valueText$: Observable<string>;
  readonly deltaText$: Observable<string>;
  readonly deltaColour$: Observable<string>;

  private readonly samples: number[];
  private readonly random: () => number;
  private drift = 0;
  private spikeLeft = 0;

  constructor(
    readonly spec: ChannelSpec,
    seed: number
  ) {
    this.random = mulberry32(seed);
    this.samples = Array.from({ length: WINDOW }, () => spec.base);
    this.heights = this.samples.map(sample => new BehaviorSubject(this.barHeight(sample)));
    this.colour$ = new BehaviorSubject(spec.colour);
    this.value$ = new BehaviorSubject(spec.base);
    this.valueText$ = this.value$.pipe(map(value => formatValue(spec, value)));
    this.deltaText$ = this.delta$.pipe(map(delta => `${delta >= 0 ? '▲' : '▼'} ${formatValue(spec, Math.abs(delta))}`));
    this.deltaColour$ = this.delta$.pipe(map(delta => (delta >= 0 === spec.upIsGood ? GOOD : BAD)));
    this.rangeText$.next(this.range());
  }

  /** Pushes one new sample and reports what it moved. */
  advance(): AdvanceResult {
    const spec = this.spec;
    // A damped random walk, so the line reads as a measurement rather
    // than as noise.
    this.drift = this.drift * 0.87 + (this.random() * 2 - 1) * 0.55;
    let value = spec.base + this.drift * spec.swing;
    if (this.spikeLeft > 0) {
      value += spec.swing * 6 * (this.spikeLeft / SPIKE_TICKS);
      this.spikeLeft--;
    }
    value = Math.max(0, value);

    this.samples.shift();
    this.samples.push(value);

    let emits = 0;
    for (let i = 0; i < WINDOW; i++) {
      this.heights[i].next(this.barHeight(this.samples[i]));
      emits++;
    }

    this.delta$.next(value - this.value$.value);
    this.value$.next(value);
    this.rangeText$.next(this.range());
    emits += 3;

    let crossing: Crossing = null;
    // Hysteresis, as any alerting rule worth having has: a channel
    // clears only once it is comfortably back under, so a value
    // hovering on the threshold does not file an incident per sample.
    const warned = this.warn$.value;
    const warn = value >= spec.warnAbove * (warned ? RECOVER_AT : 1);
    if (warn !== warned) {
      this.warn$.next(warn);
      this.colour$.next(warn ? BAD : spec.colour);
      crossing = warn ? 'up' : 'down';
      emits += 2;
    }
    return { emits, crossing };
  }

  /** Sends the channel over its threshold and lets it decay back. */
  spike(): void {
    this.spikeLeft = SPIKE_TICKS;
  }

  /** How loaded the channel is against its threshold, 0..1. */
  load(): number {
    return clamp01(this.value$.value / this.spec.warnAbove);
  }

  private range(): string {
    let low = Infinity;
    let high = -Infinity;
    for (const sample of this.samples) {
      if (sample < low) {
        low = sample;
      }
      if (sample > high) {
        high = sample;
      }
    }
    return `${formatValue(this.spec, low)} – ${formatValue(this.spec, high)}`;
  }

  private barHeight(sample: number): number {
    const spec = this.spec;
    const low = Math.max(0, spec.base - spec.swing * 2.4);
    const high = spec.base + spec.swing * 6.5;
    return BAR_MIN + clamp01((sample - low) / (high - low)) * (BAR_MAX - BAR_MIN);
  }
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly time: string;
  readonly text: string;
  readonly level: LogLevel;
}

/** The bound properties of one row of the log. */
export interface LogRowCells {
  readonly time$: BehaviorSubject<string>;
  readonly text$: BehaviorSubject<string>;
  readonly colour$: BehaviorSubject<string>;
  readonly opacity$: BehaviorSubject<number>;
}

const LEVEL_COLOUR: Record<LogLevel, string> = { info: GOOD, warn: WARN, error: BAD };

/**
 * Eight rows of log, and the entries currently written through them.
 *
 * The rows are created once and never replaced. A new entry shifts the
 * list and rewrites all eight rows' subjects, which is why the log can
 * scroll without a single node being added or removed.
 */
export class LogRing {
  readonly rows: readonly LogRowCells[] = Array.from({ length: LOG_ROWS }, () => ({
    time$: new BehaviorSubject(''),
    text$: new BehaviorSubject(''),
    colour$: new BehaviorSubject(MUTED),
    opacity$: new BehaviorSubject(0)
  }));

  private readonly entries: LogEntry[] = [];

  /** Adds an entry at the top and returns the properties it moved. */
  push(entry: LogEntry): number {
    this.entries.unshift(entry);
    if (this.entries.length > LOG_ROWS) {
      this.entries.length = LOG_ROWS;
    }
    for (let i = 0; i < LOG_ROWS; i++) {
      const row = this.rows[i];
      const current = this.entries[i];
      row.time$.next(current === undefined ? '' : current.time);
      row.text$.next(current === undefined ? '' : current.text);
      row.colour$.next(current === undefined ? MUTED : LEVEL_COLOUR[current.level]);
      // Older rows fade, so the newest line reads as the newest one.
      row.opacity$.next(current === undefined ? 0 : 1 - i * 0.085);
    }
    return LOG_ROWS * 4;
  }

  /** The entries currently on screen, newest first. */
  visible(): readonly LogEntry[] {
    return this.entries;
  }
}

const ROUTINE_EVENTS: readonly string[] = [
  'edge-3 rejoined the pool',
  'checkpoint written · 1.2 MB',
  'shard rebalance finished',
  'cache warmed for eu-west',
  'health probe · 12/12 green',
  'config revision 4471 applied',
  'connection pool resized to 64',
  'retry budget replenished'
];

// ---------------------------------------------------------------------------
// Store: the controls, and the timer that drives the feed
// ---------------------------------------------------------------------------

export interface StreamView {
  readonly running: boolean;
  readonly rate: RateName;
  readonly hz: number;
}

/**
 * The live feed, as a render-thread service.
 *
 * Deliberately *not* behind a channel. It is a synthetic generator for
 * a rendering stress test: it invents its own data, nothing else reads
 * it, and it does not survive a reload — so by the rule in
 * `decisions/0029-thread-model.md` §4.2 it is not application state.
 * Putting it across the barrier would measure the patch stream at
 * 60Hz, which is worth measuring but is not what this route exists to
 * show; the route is here to stress bindings and the renderer.
 *
 * A real live-data application would put its feed on the application
 * worker. What that costs at this update rate is an open question the
 * decision record names and nothing has answered.
 */
export class LiveFeed {
  readonly running = internalState(true);
  readonly rate = internalState<RateName>('live');

  /**
   * The stream. Deliberately not `@State`: each of these is read by
   * exactly one bound prop and changes up to sixty times a second, so
   * routing them through a projection would buy nothing and cost a
   * view model rebuilt and structurally compared every frame.
   */
  readonly channels: readonly LiveChannel[] = CHANNELS.map(
    (spec, index) => new LiveChannel(spec, 0x5eed + index * 977)
  );
  readonly log = new LogRing();
  readonly sweep$ = new BehaviorSubject(0);
  readonly clock$ = new BehaviorSubject(clockText(Date.now()));
  readonly load$ = new BehaviorSubject(0);
  readonly loadColour$ = new BehaviorSubject(GOOD);
  readonly updates$ = new BehaviorSubject(0);
  readonly ticks$ = new BehaviorSubject(0);
  readonly incidents$ = new BehaviorSubject(0);

  private readonly random = mulberry32(0x1eaf);
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private emits = 0;
  private windowStart = Date.now();
  private sinceRoutine = 0;

  constructor() {
    // The log is eight rows whether or not it has anything to say, so
    // it starts with a plausible history rather than as an empty box.
    for (const text of ['collector attached to 3 channels', 'edge-3 rejoined the pool', 'retry budget replenished']) {
      this.record(text, 'info');
    }
  }

  readonly stream: Observable<StreamView> = combineLatest([this.running, this.rate]).pipe(
    map(([running, rate]) => ({ running, rate, hz: RATES[rate].hz }))
  );

  /** Starts the feed. Called from the root component's onMount. */
  start(): void {
    this.restart();
  }

  /** Stops the feed and its timer. Called from onUnmount. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  toggle(): void {
    this.running.value = !this.running.value;
    this.restart();
    this.record(this.running.value ? 'stream resumed' : 'stream paused', 'info');
  }
  setRate(rate: RateName): void {
    if (rate === this.rate.value) {
      return;
    }
    this.rate.value = rate;
    this.restart();
    this.record(`sample rate set to ${RATES[rate].label}`, 'info');
  }
  spike(): void {
    for (const channel of this.channels) {
      channel.spike();
    }
    this.record('synthetic load injected on all channels', 'warn');
  }

  /**
   * One frame of the feed.
   *
   * Public and free of any timer, so a test can drive the board a
   * sample at a time; the interval in `restart` is the only thing that
   * calls it in the app.
   */
  tick(): void {
    this.tickCount++;
    let emits = 0;

    for (const channel of this.channels) {
      const result = channel.advance();
      emits += result.emits;
      if (result.crossing === 'up') {
        this.incidents$.next(this.incidents$.value + 1);
        emits += 1 + this.record(`${channel.spec.name} above ${channel.spec.warnAbove}${channel.spec.unit}`, 'error');
      } else if (result.crossing === 'down') {
        emits += this.record(`${channel.spec.name} back within budget`, 'info');
      }
    }

    this.sweep$.next(this.tickCount % (SWEEP_STEPS * 2));
    emits++;

    const load = this.channels.reduce((total, channel) => total + channel.load(), 0) / this.channels.length;
    this.load$.next(load);
    emits++;
    const colour = load > 0.88 ? BAD : load > 0.76 ? WARN : GOOD;
    if (colour !== this.loadColour$.value) {
      this.loadColour$.next(colour);
      emits++;
    }

    this.sinceRoutine++;
    if (this.sinceRoutine >= RATES[this.rate.value].hz * 2) {
      this.sinceRoutine = 0;
      emits += this.record(ROUTINE_EVENTS[Math.floor(this.random() * ROUTINE_EVENTS.length)], 'info');
    }

    this.ticks$.next(this.tickCount);
    emits++;

    // The rate readout is itself a bound property, so it is measured
    // twice a second rather than on every frame.
    this.emits += emits;
    const now = Date.now();
    const elapsed = now - this.windowStart;
    if (elapsed >= 500) {
      this.updates$.next(Math.round((this.emits * 1000) / elapsed));
      this.clock$.next(clockText(now));
      this.windowStart = now;
      this.emits = 0;
    }
  }

  private record(text: string, level: LogLevel): number {
    return this.log.push({ time: clockText(Date.now()), text, level });
  }

  private restart(): void {
    this.stop();
    // The rate readout is measured over a window, so the window starts
    // again whenever the feed does — otherwise the first reading after
    // a pause would be an average across the pause.
    this.emits = 0;
    this.windowStart = Date.now();
    if (!this.running.value) {
      this.updates$.next(0);
      return;
    }
    // Above `MAX_TIMER_HZ` the timer cannot be the sample rate — the
    // clamp would hold it at 4 ms whatever we ask for, and the feed
    // would quietly run slower than the button it is under. So the
    // interval stops at that floor and each firing takes the whole
    // batch of samples that fell due, which is what a collector at
    // these rates delivers anyway.
    const hz = RATES[this.rate.value].hz;
    const perTick = Math.max(1, Math.ceil(hz / MAX_TIMER_HZ));
    this.timer = setInterval(
      () => {
        for (let i = 0; i < perTick; i++) {
          this.tick();
        }
      },
      (1000 * perTick) / hz
    );
  }
}

// ---------------------------------------------------------------------------
// How many component bodies this page has ever run.
//
// Every component below counts itself in. The root reads the total in
// onMount — which the host resolver flushes once the whole tree is
// built — and the panel shows it from then on. It is the honest
// version of "no re-renders": not a claim, a counter.
// ---------------------------------------------------------------------------

let bodyRuns = 0;

function counted(): void {
  bodyRuns++;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function RailButton(props: Inputs<{ label: string; primary?: boolean; onPress: () => void }>) {
  counted();
  const hovered = internalState(false);
  const background = combineLatest([props.primary, hovered]).pipe(
    map(([primary, hover]) => (primary === true ? (hover ? '#4d97ff' : ACCENT) : hover ? '#1a2740' : 'transparent'))
  );
  return (
    <button
      onClick={() => props.onPress.value()}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}
      selfX="stretch"
      height={36}
      x="center"
      y="center"
      borderRadius={7}
      borderWidth={1}
      borderColor={props.primary.pipe(map(primary => (primary === true ? ACCENT : BORDER)))}
      backgroundColor={background}
      cursor="pointer">
      <text
        color={props.primary.pipe(map(primary => (primary === true ? '#ffffff' : TEXT)))}
        fontSize={13}
        fontWeight={600}>
        {props.label}
      </text>
    </button>
  );
}

function RateButton(props: Inputs<{ rate: RateName }>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const selected = store.stream.pipe(map(view => view.rate === props.rate.value));
  const hovered = internalState(false);
  return (
    <button
      onClick={() => store.setRate(props.rate.value)}
      onPointerEnter={() => (hovered.value = true)}
      onPointerLeave={() => (hovered.value = false)}
      flexGrow={1}
      height={32}
      x="center"
      y="center"
      borderRadius={7}
      borderWidth={1}
      borderColor={selected.pipe(map(on => (on ? ACCENT : BORDER)))}
      backgroundColor={combineLatest([selected, hovered]).pipe(
        map(([on, hover]) => (on ? 'rgba(61,139,253,0.18)' : hover ? '#1a2740' : 'transparent'))
      )}
      cursor="pointer">
      <text color={selected.pipe(map(on => (on ? ACCENT : MUTED)))} fontSize={12.5} fontWeight={600}>
        {props.rate.pipe(map(rate => RATES[rate].label))}
      </text>
    </button>
  );
}

function Label(props: Inputs<{ text: string }>) {
  counted();
  return (
    <text color={FAINT} fontSize={10.5} fontWeight={700} letterSpacing={0.9}>
      {props.text}
    </text>
  );
}

function Readout(props: Inputs<{ label: string; value: string; accent?: boolean }>) {
  counted();
  return (
    <row y="center" gap={10} selfX="stretch">
      <text color={MUTED} fontSize={12} flexGrow={1} maxLines={1} textOverflow="ellipsis">
        {props.label}
      </text>
      <text
        color={props.accent.pipe(map(accent => (accent === true ? ACCENT : TEXT)))}
        fontSize={13.5}
        fontWeight={700}>
        {props.value}
      </text>
    </row>
  );
}

function ControlRail(props: Inputs<{ bodies: number }>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const stream = store.stream;
  // Written while this body runs, and never again. If the numbers
  // above it keep climbing while this stays put, nothing was rebuilt.
  const builtAt = clockText(Date.now());

  return (
    <scrollview
      width={306}
      // The rail keeps the width it asks for. Without this it is a
      // flex item like any other, and the board's longest unbreakable
      // token — the source path in its footer — pushes hard enough to
      // shrink the rail and clip its own labels.
      flexShrink={0}
      padding={22}
      gap={22}
      backgroundColor={PANEL}
      borderColor={BORDER}
      borderWidth={1}
      selfY="stretch">
      <column gap={9} selfX="stretch">
        <row gap={9} y="center">
          <box
            width={9}
            height={9}
            borderRadius={5}
            backgroundColor={stream.pipe(map(view => (view.running ? GOOD : FAINT)))}
          />
          <text color={TEXT} fontSize={18} fontWeight={700}>
            Live feed
          </text>
        </row>
        <text color={MUTED} fontSize={12.5} lineHeight={18.5}>
          Everything moving on the right is a prop bound to an Observable. When one emits, that property changes on that
          node and the next frame is drawn from it — no component runs again, and no node is created, moved or
          destroyed.
        </text>
      </column>

      <column gap={10} selfX="stretch">
        <Label text="STREAM" />
        <RailButton
          label={stream.pipe(map(view => (view.running ? 'Pause the feed' : 'Resume the feed')))}
          primary
          onPress={() => store.toggle()}
        />
        {RATE_ROWS.map((rates, index) => (
          <row key={index} gap={7} selfX="stretch">
            {rates.map(rate => (
              <RateButton key={rate} rate={rate} />
            ))}
          </row>
        ))}
        <RailButton label="Inject a spike" onPress={() => store.spike()} />
      </column>

      <column
        gap={11}
        padding={14}
        selfX="stretch"
        backgroundColor={CARD_ALT}
        borderColor={BORDER_SOFT}
        borderWidth={1}
        borderRadius={10}>
        <Label text="THE PROOF" />
        <Readout label="Property updates / second" value={store.updates$.pipe(map(formatCount))} accent />
        <Readout label="Samples taken" value={store.ticks$.pipe(map(formatCount))} />
        <Readout label="Incidents seen" value={store.incidents$.pipe(map(formatCount))} />
        <box height={1} selfX="stretch" backgroundColor={BORDER_SOFT} />
        <Readout label="Component bodies run" value={props.bodies.pipe(map(formatCount))} />
        <Readout label="Tree built at" value={builtAt} />
      </column>

      <text color={FAINT} fontSize={11.5} lineHeight={17.5}>
        The last two numbers are the point. Thousands of property updates a second, and the component bodies still add
        up to the count they reached the moment this page was built.
      </text>
    </scrollview>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * Forty bars, each binding its own height and all of them binding the
 * same colour subject.
 *
 * The opacity ramp is a plain number per bar: it depends on the bar's
 * position, which never changes, so it is not worth an Observable.
 * Knowing which props are static is half of what makes a bound tree
 * cheap.
 */
function Sparkline(props: Inputs<{ channel: LiveChannel }>) {
  counted();
  const channel = props.channel.value;
  return (
    <row gap={2} y="end" height={BAR_MAX} selfX="stretch">
      {channel.heights.map((height$, index) => (
        <box
          key={index}
          flexGrow={1}
          minWidth={2}
          height={height$}
          borderRadius={1.5}
          backgroundColor={channel.colour$}
          opacity={0.3 + (0.7 * index) / (WINDOW - 1)}
        />
      ))}
    </row>
  );
}

function ChannelCard(props: Inputs<{ channel: LiveChannel }>) {
  counted();
  const channel = props.channel.value;
  const spec = channel.spec;
  return (
    <column
      flexGrow={1}
      flexBasis={0}
      gap={13}
      padding={16}
      backgroundColor={CARD}
      borderColor={channel.warn$.pipe(map(warn => (warn ? BAD : BORDER)))}
      borderWidth={1}
      borderRadius={11}>
      <row y="center" gap={8} selfX="stretch">
        <box width={7} height={7} borderRadius={4} backgroundColor={channel.colour$} />
        <text color={MUTED} fontSize={11.5} fontWeight={600} letterSpacing={0.4} flexGrow={1}>
          {spec.name}
        </text>
        <text color={channel.deltaColour$} fontSize={11.5} fontWeight={700}>
          {channel.deltaText$}
        </text>
      </row>

      <row y="baseline" gap={6}>
        <text color={TEXT} fontSize={31} fontWeight={700} letterSpacing={-0.5}>
          {channel.valueText$}
        </text>
        <text color={MUTED} fontSize={13}>
          {spec.unit}
        </text>
      </row>

      <Sparkline channel={channel} />

      <row y="center" gap={8} selfX="stretch">
        <text color={FAINT} fontSize={11} flexGrow={1} maxLines={1} textOverflow="ellipsis">
          {channel.rangeText$.pipe(map(range => `last ${WINDOW} · ${range}`))}
        </text>
        <text color={channel.warn$.pipe(map(warn => (warn ? BAD : FAINT)))} fontSize={11} fontWeight={600}>
          {channel.warn$.pipe(map(warn => (warn ? 'OVER BUDGET' : `budget ${formatValue(spec, spec.warnAbove)}`)))}
        </text>
      </row>
    </column>
  );
}

/**
 * The scanner: a bar that slides across a track on a bound `transform`.
 *
 * A transform binding is the cheapest of the four — it neither re-runs
 * layout nor changes a paint property of the node — so this moves for
 * free while everything else on the page is being measured.
 */
function Scanner(_props: Inputs<{}>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const travel = 132 - 34;
  const offset = store.sweep$.pipe(
    map(step => {
      const phase = step / SWEEP_STEPS;
      return { x: (phase <= 1 ? phase : 2 - phase) * travel };
    })
  );
  return (
    <box width={132} height={4} borderRadius={2} backgroundColor={TRACK} overflow="hidden">
      <box width={34} height={4} borderRadius={2} backgroundColor={ACCENT} transform={offset} />
    </box>
  );
}

/**
 * The saturation meter: two boxes in a row whose `flexGrow` values are
 * bound and sum to one. A layout binding, so the row is re-measured
 * every time the load moves.
 */
function SaturationMeter(_props: Inputs<{}>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const load = store.load$;
  return (
    <column
      gap={10}
      padding={16}
      selfX="stretch"
      backgroundColor={CARD}
      borderColor={BORDER}
      borderWidth={1}
      borderRadius={11}>
      <row y="center" gap={10} selfX="stretch">
        <Label text="SATURATION" />
        <box flexGrow={1} />
        <text color={store.loadColour$} fontSize={13} fontWeight={700}>
          {load.pipe(map(value => `${(value * 100).toFixed(1)}%`))}
        </text>
      </row>
      <row height={10} selfX="stretch" borderRadius={5} backgroundColor={TRACK} overflow="hidden">
        <box flexGrow={load} backgroundColor={store.loadColour$} />
        <box flexGrow={load.pipe(map(value => 1 - value))} />
      </row>
      <text color={FAINT} fontSize={11}>
        Two boxes sharing a row. Their flexGrow is bound, so the fill is laid out rather than drawn — the same mechanism
        a static layout uses, driven by a stream.
      </text>
    </column>
  );
}

function LogLine(props: Inputs<{ row: LogRowCells }>) {
  counted();
  const row = props.row.value;
  return (
    <row gap={11} y="center" height={26} selfX="stretch" opacity={row.opacity$}>
      <box width={6} height={6} borderRadius={3} backgroundColor={row.colour$} />
      <text color={FAINT} fontSize={11.5} fontFamily={MONO} width={62}>
        {row.time$}
      </text>
      <text color={TEXT} fontSize={12.5} flexGrow={1} maxLines={1} textOverflow="ellipsis">
        {row.text$}
      </text>
    </row>
  );
}

function EventLog(_props: Inputs<{}>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  return (
    <column
      gap={4}
      padding={16}
      selfX="stretch"
      backgroundColor={CARD}
      borderColor={BORDER}
      borderWidth={1}
      borderRadius={11}>
      <row y="center" gap={10} selfX="stretch" paddingBottom={6}>
        <Label text="EVENT LOG" />
        <box flexGrow={1} />
        <text color={FAINT} fontSize={11}>
          {`${LOG_ROWS} rows, written through — never rebuilt`}
        </text>
      </row>
      {store.log.rows.map((row, index) => (
        <LogLine key={index} row={row} />
      ))}
    </column>
  );
}

function Board(_props: Inputs<{}>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const stream = store.stream;
  const headline = combineLatest([stream, store.incidents$]).pipe(
    map(([view, incidents]) => {
      const paused = view.running ? '' : ' · paused';
      const plural = incidents === 1 ? '' : 's';
      return `${CHANNELS.length} channels · sampling at ${view.hz} Hz${paused} · ${incidents} incident${plural}`;
    })
  );

  return (
    <scrollview flexGrow={1} padding={24} gap={16} backgroundColor={BG}>
      <row y="center" gap={16} selfX="stretch">
        <column gap={3} flexGrow={1}>
          <text color={TEXT} fontSize={20} fontWeight={700}>
            Cluster telemetry
          </text>
          <text color={MUTED} fontSize={12.5}>
            {headline}
          </text>
        </column>
        <Scanner />
        <text color={TEXT} fontSize={15} fontWeight={600} fontFamily={MONO}>
          {store.clock$}
        </text>
      </row>

      <row gap={14} selfX="stretch" y="stretch">
        {CHANNELS.map((spec, index) => (
          <ChannelCard key={spec.id} channel={store.channels[index]} />
        ))}
      </row>

      <SaturationMeter />
      <EventLog />

      <text color={FAINT} fontSize={11.5} lineHeight={17.5}>
        Source: src/playground/examples/LiveExampleApp.tsx. The rates above are sampling rates, not frame rates: a
        render worker paces frames on a timer rather than the compositor, so from 60 Hz up the feed outruns it and many
        emissions coalesce into one frame — which paints the latest value of every binding, never a stale one. At 360 Hz
        that is six samples to a frame, and nothing on screen is behind.
      </text>
    </scrollview>
  );
}

/**
 * The root. It owns the feed's lifetime and the body counter, and
 * nothing else — every moving value below it arrives by binding.
 */
export function LiveApp(_props: Inputs<{}>, ctx: ComponentContext) {
  counted();
  const store = ctx.inject(LiveFeed);
  const bodies = internalState(0);

  ctx.onMount(() => {
    // Mount hooks are flushed once the whole tree exists, so this is
    // the total for the page rather than for the root alone.
    bodies.value = bodyRuns;
    store.start();
  });
  ctx.onUnmount(() => store.stop());

  return (
    <row backgroundColor={BG} y="stretch">
      <ControlRail bodies={bodies} />
      <Board />
    </row>
  );
}
