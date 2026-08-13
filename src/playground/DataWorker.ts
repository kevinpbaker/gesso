import { Subscription, distinctUntilChanged, map } from 'rxjs';

import type { DataWorkerMessage, DataWorkerOutputMessage } from './DataWorkerMessages';
import { PlaygroundState } from './PlaygroundState';
import {
  computePatch,
  fullPatch,
  snapshotStream,
  subjectForPath,
  type DataRenderPortMessage,
  type PlaygroundStateSnapshot,
  type StateOperation
} from './StatePatch';

/**
 * Data worker entry point.
 *
 * Owns PlaygroundState and all RxJS observable pipelines. Heavy work
 * such as transforms, sorts, or calculations runs here, and only the
 * resulting state patch crosses to the render worker. The render thread
 * never executes the pipeline itself.
 */

let state: PlaygroundState | undefined;
let renderPort: MessagePort | undefined;
let subscription: Subscription | undefined;
let previousSnapshot: PlaygroundStateSnapshot | undefined;

self.onmessage = (event: MessageEvent<DataWorkerMessage>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case 'init':
        initialize();
        break;
      case 'connectRender':
        connectRender(message.port);
        break;
      case 'control':
        applyControlOperation(message.op);
        break;
      case 'dispose':
        dispose();
        break;
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

function post(message: DataWorkerOutputMessage): void {
  self.postMessage(message);
}

function initialize(): void {
  dispose();
  state = new PlaygroundState();

  // Synthetic heavy observable pipeline: derived color computed on the
  // data worker with a small CPU block to simulate enterprise transforms.
  state.color$
    .pipe(
      map(color => {
        const start = performance.now();
        while (performance.now() - start < 5) {
          // Busy wait simulates a real data transform / calculation.
        }
        return lightenHex(color, 80);
      }),
      distinctUntilChanged()
    )
    .subscribe(computedColor => {
      state?.computedColor$.next(computedColor);
    });

  subscription = snapshotStream(state).subscribe(snapshot => {
    const patch = previousSnapshot === undefined ? fullPatch(snapshot) : computePatch(previousSnapshot, snapshot);
    previousSnapshot = snapshot;
    if (patch.length > 0) {
      post({ type: 'patch', patch });
      renderPort?.postMessage({ type: 'patch', patch });
    }
  });
}

function connectRender(port: MessagePort): void {
  renderPort = port;
  renderPort.onmessage = (event: MessageEvent<DataRenderPortMessage>) => {
    if (event.data.type === 'control') {
      applyControlOperation(event.data.op);
    }
  };
}

function applyControlOperation(op: StateOperation): void {
  if (state === undefined) {
    return;
  }
  if (op.op === 'set') {
    const subject = subjectForPath(state, op.path);
    subject.next(op.value);
  }
}

function dispose(): void {
  subscription?.unsubscribe();
  subscription = undefined;
  renderPort = undefined;
  state = undefined;
  previousSnapshot = undefined;
}

function lightenHex(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.round((num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
