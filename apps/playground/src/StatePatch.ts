import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import type { PlaygroundState } from './PlaygroundState';

/**
 * Serializable snapshot of PlaygroundState.
 *
 * Derived automatically from every `readonly foo$ = new BehaviorSubject(...)`
 * field on PlaygroundState. Adding a new subject to PlaygroundState is the
 * only change required; snapshot, patch and apply logic are all generic.
 */
export type PlaygroundStateSnapshot = {
  [K in keyof PlaygroundState as K extends `${infer P}$` ? P : never]: PlaygroundState[K] extends BehaviorSubject<
    infer T
  >
    ? T
    : never;
};

/**
 * A single operation in a state patch.
 *
 * Only 'set' is needed for the flat playground state. For nested or
 * array-heavy enterprise state you could add 'insert', 'remove',
 * 'move', etc.
 */
export type StateOperation = { op: 'set'; path: keyof PlaygroundStateSnapshot; value: unknown };

/**
 * A patch is an ordered list of operations that transform a snapshot
 * into the next snapshot.
 */
export type StatePatch = StateOperation[];

/**
 * Messages exchanged over the direct MessageChannel between the data
 * worker and the render worker.
 */
export type DataRenderPortMessage = { type: 'patch'; patch: StatePatch } | { type: 'control'; op: StateOperation };

const STATE_SUFFIX = '$';
const STRUCTURAL_KEYS: (keyof PlaygroundStateSnapshot)[] = ['fitPreview', 'direction', 'order', 'stressCount'];

/**
 * Returns an observable that emits a snapshot every time any subject
 * in the state changes. New subjects added to PlaygroundState are
 * picked up automatically.
 */
export function snapshotStream(state: PlaygroundState): Observable<PlaygroundStateSnapshot> {
  const entries = subjectEntries(state);
  if (entries.length === 0) {
    return of({} as PlaygroundStateSnapshot);
  }
  const subjects = entries.map(([, subject]) => subject);
  return combineLatest(subjects).pipe(
    map(values => {
      const snapshot: Record<string, unknown> = {};
      for (let i = 0; i < entries.length; i++) {
        snapshot[entries[i][0]] = values[i];
      }
      return snapshot as PlaygroundStateSnapshot;
    })
  );
}

/**
 * Serializes a PlaygroundState into a snapshot by reading every subject.
 */
export function stateToSnapshot(state: PlaygroundState): PlaygroundStateSnapshot {
  const snapshot: Record<string, unknown> = {};
  for (const [path, subject] of subjectEntries(state)) {
    snapshot[path] = subject.getValue();
  }
  return snapshot as PlaygroundStateSnapshot;
}

/**
 * Applies a patch to a snapshot, returning a new snapshot.
 */
export function applyPatch(snapshot: PlaygroundStateSnapshot, patch: StatePatch): PlaygroundStateSnapshot {
  const next = { ...snapshot };
  for (const operation of patch) {
    if (operation.op === 'set') {
      (next as Record<string, unknown>)[operation.path] = operation.value;
    }
  }
  return next;
}

/**
 * Computes the minimal patch that transforms `previous` into `current`.
 */
export function computePatch(previous: PlaygroundStateSnapshot, current: PlaygroundStateSnapshot): StatePatch {
  const patch: StatePatch = [];
  for (const key of Object.keys(previous) as (keyof PlaygroundStateSnapshot)[]) {
    if (!Object.is(previous[key], current[key])) {
      patch.push({ op: 'set', path: key, value: current[key] });
    }
  }
  return patch;
}

/**
 * Builds a patch that sets every field of a snapshot. Used for the
 * initial sync.
 */
export function fullPatch(snapshot: PlaygroundStateSnapshot): StatePatch {
  return (Object.keys(snapshot) as (keyof PlaygroundStateSnapshot)[]).map(path => ({
    op: 'set',
    path,
    value: snapshot[path]
  }));
}

/**
 * Applies a snapshot to a PlaygroundState, updating each BehaviorSubject
 * only when its value actually changes. Returns true when the change is
 * structural and requires a full rebuild.
 */
export function applyPatchToState(state: PlaygroundState, snapshot: PlaygroundStateSnapshot): boolean {
  const needsRebuild = STRUCTURAL_KEYS.some(key => {
    const subject = subjectForPath(state, key);
    return !Object.is(subject.getValue(), (snapshot as Record<string, unknown>)[key]);
  });

  for (const [path, value] of Object.entries(snapshot)) {
    const subject = subjectForPath(state, path);
    setIfChanged(subject, value);
  }

  return needsRebuild;
}

/**
 * Returns the BehaviorSubject for a given snapshot path.
 */
export function subjectForPath(state: PlaygroundState, path: string): BehaviorSubject<unknown> {
  const key = `${path}${STATE_SUFFIX}`;
  const value = (state as unknown as Record<string, unknown>)[key];
  if (value instanceof BehaviorSubject) {
    return value as BehaviorSubject<unknown>;
  }
  throw new Error(`No BehaviorSubject found for state path '${path}' (expected '${key}').`);
}

function subjectEntries(state: PlaygroundState): [string, BehaviorSubject<unknown>][] {
  const result: [string, BehaviorSubject<unknown>][] = [];
  const record = state as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.endsWith(STATE_SUFFIX)) {
      const value = record[key];
      if (value instanceof BehaviorSubject) {
        result.push([key.slice(0, -STATE_SUFFIX.length), value as BehaviorSubject<unknown>]);
      }
    }
  }
  return result;
}

function setIfChanged<T>(subject: BehaviorSubject<T>, value: T): void {
  if (!Object.is(subject.getValue(), value)) {
    subject.next(value);
  }
}
