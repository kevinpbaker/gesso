import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Counter } from './CounterExample';

/**
 * The other half of F7's "the docs site's examples are the tests": the
 * page and this spec import the same module, so a snippet that stops
 * working stops the suite.
 */
describe('the docs counter', () => {
  it('counts when its button is pressed', () => {
    const ui = renderTest(createComponent(Counter, { label: 'Clicks' }), { width: 320, height: 160 });

    expect(ui.getByRole('button')).toHaveSemantics({ role: 'button', name: 'Add one' });
    expect(ui.getByText('Clicks: 0')).toBeDefined();

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(ui.getByText('Clicks: 1')).toBeDefined();
  });
});
