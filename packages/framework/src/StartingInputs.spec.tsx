import { describe, expect, it } from 'vitest';

import type { UiChild } from 'gesso-core';

import { InspectionService } from './app/InspectionService';
import { mountRuntime } from './app/RuntimeTestUtils';
import { controlled } from './controlled';
import type { ComponentContext, Inputs } from './FunctionComponent';
import { input } from './Input';
import { StartingInputs } from './StartingInputs';

/**
 * A step counter that owns its step when given one without a handler,
 * as a tour does, and a label beside it; the moment starts the counter
 * at its third step and leaves the label alone.
 */
describe('StartingInputs', () => {
  let inspection!: InspectionService;
  const shown: Record<string, () => unknown> = {};
  const change: Record<string, (to: number) => void> = {};

  function Steps(
    inputs: Inputs<{ step?: number; defaultStep?: number; onStepChange?: (step: number) => void }>,
    ctx: ComponentContext
  ): UiChild {
    inspection = ctx.inject(InspectionService);
    const step = controlled<number>({
      component: 'Steps',
      name: 'step',
      source: inputs.step,
      initial: inputs.defaultStep,
      fallback: 0,
      onChange: inputs.onStepChange
    });
    shown.steps = () => step.current();
    change.steps = to => step.change(to);
    return <text text="steps" />;
  }
  function Label(inputs: Inputs<{ step?: number }>): UiChild {
    const step = input(inputs.step, 0);
    shown.label = () => step.value;
    return <text text="label" />;
  }

  it('starts each component it names from its inputs, over its parent’s, and leaves the others', () => {
    const mounted = mountRuntime(
      <column>
        <StartingInputs of={{ Steps: { step: 2 } }}>
          <column>
            <Steps step={0} />
            <Label step={5} />
          </column>
        </StartingInputs>
      </column>
    );
    mounted.frame();

    expect(shown.steps!()).toBe(2);
    expect(shown.label!()).toBe(5);
    // Started, not held: the person moves it on from there.
    change.steps!(3);
    expect(shown.steps!()).toBe(3);
  });

  it('is gone under a preview of the component, and back when the preview ends', () => {
    const mounted = mountRuntime(
      <column>
        <StartingInputs of={{ Steps: { step: 2 } }}>
          <Steps />
        </StartingInputs>
      </column>
    );
    mounted.frame();
    const anchor = inspection
      .inspect(inspection.nodesAt(1, 1)[0]!)
      .owners.find(owner => owner.name === 'Steps')!.anchorId;

    inspection.previewInputs(anchor, { step: 1 });
    expect(shown.steps!()).toBe(1);
    inspection.endInputPreview(anchor);
    expect(shown.steps!()).toBe(2);
  });
});
