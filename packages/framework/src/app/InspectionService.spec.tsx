import { describe, expect, it } from 'vitest';

import type { UiChild } from 'gesso-core';

import type { ComponentContext } from '../FunctionComponent';
import { InspectionService } from './InspectionService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * A component asking what is under a point, as a design editor's canvas
 * does when a click picks a box instead of pressing it.
 */
describe('InspectionService', () => {
  it('names the nodes under a point, topmost first, and the line that wrote each', () => {
    let inspection!: InspectionService;
    function Canvas(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      return (
        <column padding={20}>
          <box width={200} height={100} backgroundColor="surface">
            <text text="Save" />
          </box>
        </column>
      );
    }
    const mounted = mountRuntime(
      <column>
        <Canvas />
      </column>
    );
    mounted.frame();

    const stack = inspection.nodesAt(30, 25);
    const report = inspection.inspect(stack[0]!);

    expect(stack.map(node => node.type).slice(0, 3)).toEqual(['text', 'box', 'column']);
    expect(report.type).toBe('text');
    expect(report.source?.fileName).toMatch(/InspectionService\.spec\.tsx$/);
    expect(report.owners[0]?.name).toBe('Canvas');
    // Outside it, the box is not there; the runtime's own root, also a box, is.
    expect(inspection.nodesAt(500, 500)).not.toContain(stack[1]);
  });
});
