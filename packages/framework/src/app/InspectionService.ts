import type { UiNode } from 'gesso-core';

import type { UiNodeReport } from './NodeReport';

/**
 * What is on the screen, as a component can ask: the nodes under a
 * point, and what each one is.
 *
 * The inspector already answers both, for the devtools panel, from the
 * runtime's hit tester and its node report. A tool built in Gesso that
 * points at Gesso needs the same answers from inside the tree: a design
 * editor whose canvas holds live frames, where a click picks the box
 * under it instead of pressing it and says which line wrote it. So the
 * runtime puts them here, as it puts frames in `FrameService`.
 * Injected like any service: `ctx.inject(InspectionService)`.
 */
export class InspectionService {
  private host: InspectionHost | null = null;

  /** Called by the runtime; not for components. */
  attach(host: InspectionHost): void {
    this.host = host;
  }

  /**
   * Every node under a point, topmost first, in the coordinates a
   * pointer event carries: the one a press would reach, then each one
   * it is painted over. Empty before the first frame.
   */
  nodesAt(x: number, y: number): readonly UiNode[] {
    return this.host?.nodesAt(x, y) ?? [];
  }

  /**
   * What the node is, as the inspector reports it: its box, its props,
   * the components that rendered it and, compiled for development, the
   * line that wrote it (`source`) and where each of those components
   * was used (`owners[].usedAt`).
   */
  inspect(node: UiNode): UiNodeReport {
    if (this.host === null) {
      throw new Error('InspectionService has nothing to inspect before the runtime has built its tree.');
    }
    return this.host.inspect(node);
  }
}

/** What the runtime gives the service. */
export interface InspectionHost {
  nodesAt(x: number, y: number): readonly UiNode[];
  inspect(node: UiNode): UiNodeReport;
}
