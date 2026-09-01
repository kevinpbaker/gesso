import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Cells } from './CellsExample';

/**
 * Three claims, one per kind of value: own state changes one line and
 * not the other, a prop from the parent changes both, and the derived
 * total follows either without being stored anywhere.
 */
describe('the docs cells example', () => {
  it('keeps each line’s own quantity to itself', () => {
    const ui = renderTest(createComponent(Cells, {}), { width: 460, height: 300 });
    const [more] = ui.getAllByRole('button').filter(node => ui.querySemantics(node)?.label === 'More');

    ui.fireEvent.click(more);
    ui.frame();

    // The first line moved to two; the second is still one, so the two
    // cells are genuinely separate.
    expect(ui.getAllByText('$25.00')).toHaveLength(1);
    expect(ui.getAllByText('$12.50')).toHaveLength(1);
  });

  it('follows a prop the parent changes, on both lines at once', () => {
    const ui = renderTest(createComponent(Cells, {}), { width: 460, height: 300 });

    expect(ui.getAllByText('$12.50')).toHaveLength(2);

    ui.fireEvent.click(ui.getByLabel('Switch currency'));
    ui.frame();

    expect(ui.getAllByText('€11.50')).toHaveLength(2);
    expect(ui.getByText('Showing EUR, switch')).toBeDefined();
  });
});
