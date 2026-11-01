import { describe, expect, it } from 'vitest';

import { BehaviorSubject } from 'rxjs';

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

  it('starts each of a name from its own place in a list, in the order they are made', () => {
    const seen: number[] = [];
    function Step(inputs: Inputs<{ step?: number }>): UiChild {
      seen.push(input(inputs.step, 0).value);
      return <text text="step" />;
    }
    const mounted = mountRuntime(
      <column>
        <StartingInputs of={{ Step: [null, { step: 2 }] }}>
          <column>
            <Step step={1} />
            <Step step={1} />
            <Step step={1} />
          </column>
        </StartingInputs>
      </column>
    );
    mounted.frame();

    expect(seen).toEqual([1, 2, 1]);
  });

  it('gives an input back to the parent once the parent passes something new', () => {
    const open = new BehaviorSubject(false);
    function Sheet(inputs: Inputs<{ open?: boolean }>): UiChild {
      const shown = input(inputs.open, false);
      shown.subscribe(value => (shown.label = String(value)));
      shownNow = () => shown.getValue();
      return <text text="sheet" />;
    }
    let shownNow = (): boolean => false;
    const mounted = mountRuntime(
      <column>
        <StartingInputs of={{ Sheet: { open: true } }}>
          <Sheet open={open} />
        </StartingInputs>
      </column>
    );
    mounted.frame();
    expect(shownNow()).toBe(true);

    // Its owner closes it: closed, as a dialog saved open closes.
    open.next(false);
    expect(shownNow()).toBe(false);
  });

  it('reports what a component holds now, for a tool saving the moment', () => {
    const mounted = mountRuntime(
      <column>
        <Steps defaultStep={1} />
      </column>
    );
    mounted.frame();
    change.steps!(3);
    const owner = inspection.inspect(inspection.nodesAt(1, 1)[0]!).owners.find(each => each.name === 'Steps')!;

    expect(owner.live).toEqual({ step: 3 });
  });

  it("lets the outer of two decide an input both give, and keeps the inner one's others", () => {
    const seen: number[] = [];
    function Step(inputs: Inputs<{ step?: number; size?: number }>): UiChild {
      seen.push(input(inputs.step, 0).value, input(inputs.size, 0).value);
      return <text text="step" />;
    }
    const mounted = mountRuntime(
      <column>
        <StartingInputs of={{ Step: { step: 2 } }}>
          <StartingInputs of={{ Step: { step: 1, size: 9 } }}>
            <Step />
          </StartingInputs>
        </StartingInputs>
      </column>
    );
    mounted.frame();

    // The outer one's step, and the inner one's size, which the outer does not give.
    expect(seen).toEqual([2, 9]);
  });
});
