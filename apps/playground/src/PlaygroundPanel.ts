import type { BehaviorSubject } from 'rxjs';

import { mountShell } from './shell/AppShell';
import { renderControls, type ControlGroupSpec } from './shell/Controls';
import type { PlaygroundMetrics } from './LayoutPlayground';
import type { PlaygroundDirection, PlaygroundState } from './PlaygroundState';
import type { PlaygroundStateSnapshot } from './StatePatch';

const SCROLL_RANGE_MAX = 180;
const STRESS_SIZES = [0, 1000, 5000, 10000] as const;
const DEFAULT_ORDER = ['a', 'b', 'c'];

/**
 * Callback invoked when a control changes.
 *
 * When omitted the panel writes straight to the supplied state. The
 * canvas route passes one so control changes travel to the data
 * worker that actually owns the state, and the panel is updated by
 * the patch that comes back.
 */
export type ControlDispatcher = (path: keyof PlaygroundStateSnapshot, value: unknown) => void;

/**
 * The shell plus the readouts the layout routes report into.
 *
 * The `update*` methods are kept as named operations rather than
 * exposing the status lines directly, because which line a reading
 * belongs on is a property of the chrome, not of the route.
 */
export interface PlaygroundPanel {
  /** Container the route appends its visualizer into. */
  readonly preview: HTMLElement;
  updateMetrics(metrics: PlaygroundMetrics): void;
  updateScrollStats(text: string): void;
  updateSelected(text: string): void;
  dispose(): void;
}

/**
 * Mounts the layout playground's chrome: the shared shell, plus the
 * control sidebar every layout-driven route shows.
 */
export function mountPlaygroundPanel(
  host: HTMLElement,
  routeId: string,
  state: PlaygroundState,
  dispatch?: ControlDispatcher
): PlaygroundPanel {
  const shell = mountShell(host, { routeId, sidebar: true, metrics: true });
  const disposeControls = renderControls(shell.sidebar, buildControlGroups(state, dispatch));

  shell.setStatus('Click a box in the preview to inspect it.');
  shell.setDetail('No scroll view in this scene.');

  return {
    preview: shell.preview,
    updateMetrics(metrics) {
      shell.setMetrics([
        { label: 'Nodes', value: String(metrics.nodeCount) },
        { label: 'Dirty', value: String(metrics.dirtyCount) },
        { label: 'Frames', value: String(metrics.frameCount) },
        { label: 'Layouts', value: String(metrics.layoutPasses) },
        { label: 'Frame', value: `${metrics.lastFrameMs.toFixed(2)} ms` },
        { label: 'Layout', value: `${metrics.lastLayoutMs.toFixed(2)} ms` }
      ]);
    },
    updateScrollStats: text => shell.setDetail(text),
    updateSelected: text => shell.setStatus(text),
    dispose() {
      disposeControls();
      shell.dispose();
    }
  };
}

/**
 * Describes the sidebar. Each group maps to one aspect of the scene
 * the definition builds, in the order the definition nests them, so
 * reading down the panel walks down the tree.
 */
function buildControlGroups(state: PlaygroundState, dispatch?: ControlDispatcher): ControlGroupSpec[] {
  const write = <T>(subject: BehaviorSubject<T>, path: keyof PlaygroundStateSnapshot) => {
    return (value: T): void => {
      if (dispatch !== undefined) {
        dispatch(path, value);
      } else {
        subject.next(value);
      }
    };
  };
  const number = (
    label: string,
    subject: BehaviorSubject<number>,
    path: keyof PlaygroundStateSnapshot,
    step?: number
  ) => ({
    kind: 'number' as const,
    label,
    value$: subject,
    onInput: write(subject, path),
    min: 0,
    step
  });

  return [
    {
      title: 'Root',
      controls: [
        {
          kind: 'switch',
          label: 'Fit preview',
          value$: state.fitPreview$,
          onInput: write(state.fitPreview$, 'fitPreview')
        },
        // Width and height are ignored while the root fits the
        // preview, so they are disabled rather than left editable
        // and silently without effect.
        { ...number('Width', state.width$, 'width'), disabledWhen$: state.fitPreview$ },
        { ...number('Height', state.height$, 'height'), disabledWhen$: state.fitPreview$ },
        number('Padding', state.padding$, 'padding'),
        number('Gap', state.gap$, 'gap'),
        {
          kind: 'select',
          label: 'Direction',
          value$: state.direction$ as BehaviorSubject<string>,
          onInput: write(state.direction$, 'direction') as (value: string) => void,
          options: [
            { value: 'column' satisfies PlaygroundDirection, label: 'Column' },
            { value: 'row' satisfies PlaygroundDirection, label: 'Row' }
          ]
        }
      ]
    },
    {
      title: 'Child row',
      controls: [
        number('Box A width', state.boxWidth$, 'boxWidth'),
        number('Box A height', state.boxHeight$, 'boxHeight'),
        number('Box B flex grow', state.flexGrow$, 'flexGrow', 0.1)
      ]
    },
    {
      title: 'Nested column',
      controls: [number('Min width', state.minWidth$, 'minWidth'), number('Max width', state.maxWidth$, 'maxWidth')]
    },
    {
      title: 'Paint only',
      controls: [
        {
          kind: 'color',
          label: 'Header color',
          value$: state.color$,
          onInput: write(state.color$, 'color')
        }
      ]
    },
    {
      title: 'Scroll view',
      controls: [
        {
          kind: 'range',
          label: 'Scroll Y',
          value$: state.scrollY$,
          onInput: write(state.scrollY$, 'scrollY'),
          min: 0,
          max: SCROLL_RANGE_MAX
        }
      ]
    },
    {
      title: 'Keyed list',
      controls: [
        { kind: 'readout', label: 'Order', value$: state.order$ },
        {
          kind: 'buttons',
          buttons: [
            {
              label: 'Rotate ←',
              onClick: () => write(state.order$, 'order')(rotate(state.order$.getValue(), -1))
            },
            {
              label: 'Rotate →',
              onClick: () => write(state.order$, 'order')(rotate(state.order$.getValue(), 1))
            },
            { label: 'Reset', onClick: () => write(state.order$, 'order')([...DEFAULT_ORDER]) }
          ]
        }
      ]
    },
    {
      title: 'Stress test',
      controls: [
        {
          kind: 'buttons',
          pressedFrom$: state.stressCount$,
          buttons: STRESS_SIZES.map(size => ({
            label: size === 0 ? 'Off' : `${size / 1000}k`,
            onClick: () => write(state.stressCount$, 'stressCount')(size),
            pressedWhen: (current: unknown) => current === size
          }))
        }
      ]
    }
  ];
}

/** Rotates the keyed list, so items are reordered but keep identity. */
function rotate(order: readonly string[], step: number): string[] {
  const next = [...order];
  const shift = ((step % next.length) + next.length) % next.length;
  for (let i = 0; i < shift; i++) {
    next.push(next.shift()!);
  }
  return next;
}
