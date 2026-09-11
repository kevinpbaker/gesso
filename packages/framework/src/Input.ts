import { BehaviorSubject, type Observable, Subject } from 'rxjs';

/**
 * Reactive cell holding a component input.
 *
 * Inputs must be cells because render() runs exactly once. A component
 * that read a plain input value during render would capture it for the
 * life of the instance, so a parent supplying new props under a
 * dynamic subtree would update the field while the rendered tree kept
 * showing the original value.
 *
 * The cell is written by the component host only: it accepts whatever
 * the parent passed, subscribing it first when the parent passed an
 * Observable. `value` is deliberately read-only, so `this.label.value =
 * x` inside a component is a compile error rather than a silent
 * violation of the one-way data flow.
 */
export class InputCell<T> extends BehaviorSubject<T> {
  /**
   * What to call this cell in a warning: `Component.prop`, or
   * `channel.key`. Set by whoever creates it; a cell without one is
   * reported as "a cell".
   */
  label: string | undefined;
  /** The component whose body read `.value`, for the stale-read warning below. */
  private snapshotBy: string | null = null;
  private warnedStale = false;
  /** Everything emitted through `emit`, created on the first `events` read. */
  private emitted: Subject<unknown> | null = null;

  constructor(initialValue: T) {
    super(initialValue);
  }

  /**
   * Fires the output this cell stands for.
   *
   * An output is a cell whose value is what the parent gave to be
   * called: a function, or a target made by `into(subject)`. `emit`
   * calls it with the arguments, and also pushes the first argument
   * through `events`, so the component can fire from three places
   * without passing the cell around and a parent that wants a stream
   * can have one. A parent that passed nothing is fine: the call
   * simply reaches nobody.
   */
  emit(...args: EmitArgs<T>): void {
    const handler = super.getValue() as unknown;
    if (typeof handler === 'function') {
      (handler as (...values: unknown[]) => void)(...args);
    }
    this.emitted?.next(args[0]);
  }

  /** What `emit` has fired, as a stream: the first argument of each call. */
  get events(): Observable<EmitValue<T>> {
    if (this.emitted === null) {
      this.emitted = new Subject<unknown>();
    }
    return this.emitted.asObservable() as Observable<EmitValue<T>>;
  }

  override get value(): T {
    trackRead(this);
    // A read a `computed` is collecting is not the body's snapshot: the
    // computed follows this cell from here on and carries the change,
    // and a body that read the computed itself is the computed's own
    // stale watch to report. Recording it here as well warned, wrongly,
    // for a screen row whose `computed` input had let go with the row.
    if (bodyOf !== null && tracking === null && this.snapshotBy === null) {
      this.snapshotBy = bodyOf;
    }
    return super.getValue();
  }

  /**
   * The one place the run-once model goes quietly wrong is a body that
   * reads `props.x.value`, uses the value to build the tree, and never
   * hears that it changed. Nothing crashes; the screen is simply stale.
   * So a cell remembers being read while a body ran, and if it later
   * changes with nobody subscribed to it, it says so once. A cell that
   * something is following is fine: the follower carries the change.
   */
  override next(value: T): void {
    if (this.snapshotBy !== null && !this.warnedStale && !this.observed && !Object.is(value, super.getValue())) {
      this.warnedStale = true;
      warnStaleRead(this.snapshotBy, this.label, super.getValue(), value);
    }
    super.next(value);
  }
}

/** The component whose function body is running, while one is. */
let bodyOf: string | null = null;

/** The component whose body is running, for a cell that wants to remember being read there. */
export function currentBody(): string | null {
  return bodyOf;
}

/**
 * Anything with a current value that can be followed: an input, an
 * internal state, a channel view key, a computed. What `computed`
 * collects as it runs.
 */
export interface ReadableCell<T> extends Observable<T> {
  readonly value: T;
}

/** The set a running `computed` is collecting its reads into, while one is. */
let tracking: Set<ReadableCell<unknown>> | null = null;

/** Records a `.value` read for whatever `computed` is running, if one is. */
export function trackRead(cell: ReadableCell<unknown>): void {
  tracking?.add(cell);
}

/** Runs `run` with every `.value` read on the way recorded into `into`. */
export function withTracking<T>(into: Set<ReadableCell<unknown>>, run: () => T): T {
  const previous = tracking;
  tracking = into;
  try {
    return run();
  } finally {
    tracking = previous;
  }
}

/**
 * Runs a component's body with its name on record, so a `.value` read
 * inside it can be told apart from one in an event handler later, which
 * is the ordinary way to read the current value and warns about nothing.
 */
export function withBodyOf<T>(tag: string, run: () => T): T {
  const previous = bodyOf;
  bodyOf = tag;
  try {
    return run();
  } finally {
    bodyOf = previous;
  }
}

function warnStaleRead(tag: string, label: string | undefined, from: unknown, to: unknown): void {
  const what = label === undefined ? 'a cell' : `\`${label}\``;
  const change = describeChange(from, to);
  console.warn(
    `Component '${tag}' read ${what} with .value while its body ran, and nothing is following that cell. ` +
      `It has since changed ${change}, and whatever was built from the first value still shows it. ` +
      `A component body runs once: bind the cell instead (pass it, or pipe it, into the prop it feeds), ` +
      `or give the component a key so a new value builds a new one.`
  );
}

/**
 * "from X to Y", or for two plain objects the first field that differs,
 * because two objects that print alike for sixty characters say nothing
 * about what actually moved.
 */
function describeChange(from: unknown, to: unknown): string {
  if (isPlainObject(from) && isPlainObject(to)) {
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      const before = from[key];
      const after = to[key];
      if (!Object.is(before, after) && safeJson(before) !== safeJson(after)) {
        return `at .${key}, from ${describe(before)} to ${describe(after)}`;
      }
    }
    return 'to an equal-looking object';
  }
  return `from ${describe(from)} to ${describe(to)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describe(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'function' ? 'a function' : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/**
 * Creates a component input cell.
 *
 * Inside a class component the argument is the default the cell holds
 * until the parent supplies a value:
 *
 *   @Input() label = input('Count');
 *
 * Inside a functional component the props are already cells; the
 * two-argument form derives a cell that replaces `undefined` with a
 * fallback, which is how an optional prop gets its default:
 *
 *   function Counter(inputs: Inputs<{ label?: string }>) {
 *     const label = input(inputs.label, 'Count');   // InputCell<string>
 *     return Text({ text: label });
 *   }
 *
 * The derived cell follows the source for the life of the component
 * and completes when the source does, so it needs no teardown.
 */
export function input<T>(initialValue: T): InputCell<T>;
export function input<T>(source: InputCell<T | undefined>, fallback: T): InputCell<T>;
export function input<T>(first: T | InputCell<T | undefined>, fallback?: T): InputCell<T> {
  if (arguments.length < 2 || !(first instanceof InputCell)) {
    return new InputCell(first as T);
  }
  const source = first as InputCell<T | undefined>;
  const withFallback = (value: T | undefined): T => (value === undefined ? (fallback as T) : value);
  const derived = new InputCell<T>(withFallback(source.value));
  derived.label = source.label;
  source.subscribe({
    next: value => derived.next(withFallback(value)),
    complete: () => derived.complete()
  });
  return derived;
}

/** The arguments `emit` takes for a cell holding a handler of type `T`. */
export type EmitArgs<T> = NonNullable<T> extends (...args: infer A) => void ? A : never;

/** What `events` carries for a cell holding a handler of type `T`: the handler's first argument. */
export type EmitValue<T> = NonNullable<T> extends (first: infer V, ...rest: never[]) => void ? V : void;

/**
 * A component's output: an input cell that holds whatever the parent
 * gave to be called, fired through `emit`. Every function-typed member
 * of a component's inputs is one, so on a component declared with
 * `onOpen: (id: string) => void`, `inputs.onOpen.emit(id)` is how the
 * component speaks, and a parent may pass a function or `into(subject)`.
 * The name is for a class field: `@Output() changed = output<[number]>()`.
 */
export type OutputCell<A extends unknown[]> = InputCell<((...args: A) => void) | undefined>;

/**
 * An output a class component declares as a field:
 *
 *   @Output() changed = output<[value: number]>();
 *
 * The host wires the parent's handler into it exactly as it wires an
 * input, and `this.changed.emit(next)` fires it.
 */
export function output<A extends unknown[]>(): OutputCell<A> {
  return new InputCell<((...args: A) => void) | undefined>(undefined);
}

const OUTPUT_TARGET: unique symbol = Symbol('gesso:output-target');

/**
 * A parent's way of receiving an output as a stream rather than a call:
 *
 *   const opened = new Subject<string>();
 *   <Card onOpen={into(opened)} />
 *
 * Wrapped rather than passed bare, because a bare `Subject` is an
 * Observable and would be read as an *input* the parent is feeding the
 * child, which is the opposite direction.
 */
export interface OutputTarget<V> {
  readonly [OUTPUT_TARGET]: { next(value: V): void };
}

export function into<V>(target: { next(value: V): void }): OutputTarget<V> {
  return { [OUTPUT_TARGET]: target };
}

export function isOutputTarget(value: unknown): value is OutputTarget<unknown> {
  return typeof value === 'object' && value !== null && OUTPUT_TARGET in value;
}

/** The receiver an `into()` target wraps. */
export function outputTargetOf<V>(target: OutputTarget<V>): { next(value: V): void } {
  return target[OUTPUT_TARGET];
}
