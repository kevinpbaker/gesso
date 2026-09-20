/**
 * The other half of what a consumer installs.
 *
 * `main.ts` proves the published packages paint in a browser. This
 * proves the published `gesso-testing` lets someone test a component
 * without one — mounted from the tarball, typechecked against the
 * rolled-up declarations, with no workspace link anywhere in the
 * resolution.
 *
 * It deliberately declares its own small component rather than
 * importing `main.ts`, which mounts into `#app` at module scope and so
 * cannot be imported outside a browser.
 */
import { describe, expect, it } from 'vitest';
import { map } from 'rxjs';

import { Button, Column, Text } from 'gesso-core';
import { createComponent, input, internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

function Stepper(inputs: Inputs<{ label?: string }>, _context: ComponentContext) {
  const label = input(inputs.label, 'Count');
  const count = internalState(0);
  return Column(
    { gap: 8, padding: 8 },
    Text({ text: label, label: 'caption' }),
    Button({ label: 'Add one', width: 80, height: 24, onClick: () => count.value++ }, Text({ text: '+1' })),
    Text({ text: count.pipe(map(String)) })
  );
}

describe('Stepper', () => {
  it('is reachable the way an assistive technology reaches it', () => {
    const ui = renderTest(createComponent(Stepper, { label: 'Clicks' }), { width: 200, height: 120 });

    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Add one' });
    expect(ui.getByLabel('caption')).toHaveText('Clicks');
  });

  it('counts when the button is pressed, and lays the button out where it was told', () => {
    const ui = renderTest(createComponent(Stepper, {}), { width: 200, height: 120 });

    expect(ui.getByRole('button')).toHaveBox({ width: 80, height: 24 });

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.getByText('1')).toBeDefined();
  });
});
