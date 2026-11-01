import { map } from 'rxjs';

import { percent, provided, Stack, type UiChild } from 'gesso-core';

import type { ComponentContext, Inputs } from './FunctionComponent';
import { StartingInputsKey, type StartingInputsByName } from './startingInputsKey';

export interface StartingInputsProps {
  /** Inputs by component name: `{ ScrollArea: { scrollY: 600 }, Tour: { step: 1 } }`. */
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
 * rather than steer one: a new `of` reaches components made after it.
 * Nested, the nearer one is the whole answer for a name it gives, and
 * the farther one's other names still reach through. It fills what
 * holds it.
 */
export function StartingInputs(inputs: Inputs<StartingInputsProps>, ctx: ComponentContext): UiChild {
  const outer = ctx.environment(StartingInputsKey);
  return Stack(
    {
      width: percent(100),
      height: percent(100),
      x: 'stretch',
      y: 'stretch',
      provide: inputs.of.pipe(map(of => [provided(StartingInputsKey, { ...outer, ...of })]))
    },
    inputs.children.pipe(map(children => children ?? []))
  );
}
