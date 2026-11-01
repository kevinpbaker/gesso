import { map } from 'rxjs';

import { percent, provided, Stack, type UiChild } from 'gesso-core';

import type { ComponentContext, Inputs } from './FunctionComponent';
import { StartingInputsKey, type StartingInputsByName } from './startingInputsKey';

export interface StartingInputsProps {
  /**
   * Inputs by component name: `{ ScrollArea: { scrollY: 600 }, Tour: { step: 1 } }`;
   * or a list for each instance in the order they are made, `null` for
   * one left as written: `{ Toggle: [null, { on: true }] }`.
   */
  of?: StartingInputsByName;
  children?: UiChild;
}

/**
 * Draws what it holds with the components in it started from given
 * inputs, named by component, over what their parents pass: every
 * `ScrollArea` in it scrolled to 600, every `Tour` at its second step.
 *
 * What a design tool draws a moment of a screen with, beside the
 * screen as written, without a copy of the screen to drift from it: a
 * list scrolled far enough for its back-to-top button, a dialog open,
 * a tour on its second step. A component reads them as it would its
 * parent's props, so one that takes a value without a handler beside
 * it starts there and is then the person's to change, in a design
 * tool's player as anywhere. A preview of inputs (`InspectionService.
 * previewInputs`) goes over them, and ending it comes back to them.
 *
 * They are read as each component is made, so they start a component
 * rather than steer one: a new `of` reaches components made after it,
 * and once the parent passes something new for an input, it is the
 * parent's again, as a dialog saved open closes when its owner closes
 * it.
 * Nested, the outer one wins for an input both give a component, and
 * the inner one's other inputs and names still reach in: what draws a
 * screen at a moment decides over what the screen starts itself with,
 * so a moment saved from a moment is the later one. A list per instance
 * is taken whole. It fills what holds it.
 */
export function StartingInputs(inputs: Inputs<StartingInputsProps>, ctx: ComponentContext): UiChild {
  const outer = ctx.environment(StartingInputsKey);
  return Stack(
    {
      width: percent(100),
      height: percent(100),
      x: 'stretch',
      y: 'stretch',
      provide: inputs.of.pipe(map(of => [provided(StartingInputsKey, merged(of ?? {}, outer))]))
    },
    inputs.children.pipe(map(children => children ?? []))
  );
}

/** `inner` with `outer` over it, input by input for a component both give one record. */
function merged(inner: StartingInputsByName, outer: StartingInputsByName): StartingInputsByName {
  const out: Record<string, StartingInputsByName[string]> = { ...inner };
  for (const [name, given] of Object.entries(outer)) {
    const under = out[name];
    out[name] = under !== undefined && !Array.isArray(under) && !Array.isArray(given) ? { ...under, ...given } : given;
  }
  return out;
}
