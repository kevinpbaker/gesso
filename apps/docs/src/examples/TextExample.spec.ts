import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { TextLayout } from './TextExample';

const TITLE = 'Text is the input to most layout decisions, and this title is long enough to prove it';

/**
 * Wrapping is the claim, so the spec measures it: a narrower card makes
 * the body taller, and the clamped title does not grow with it.
 */
describe('the docs text example', () => {
  it('makes the body taller when the card gets narrower, and holds the title at two lines', () => {
    const ui = renderTest(createComponent(TextLayout, {}), { width: 520, height: 400 });
    const body = ui.getByText(/laid out by the same measurer/);
    const title = ui.getByText(TITLE);

    const wide = { body: ui.getLayout(body).height, title: ui.getLayout(title).height };

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    const narrow = { body: ui.getLayout(body).height, title: ui.getLayout(title).height };

    // Same nodes, re-wrapped: the paragraph needed more lines.
    expect(narrow.body).toBeGreaterThan(wide.body);
    // The title is clamped, so it cannot answer a narrower card by
    // growing — which is the whole point of `maxLines`.
    expect(narrow.title).toBe(wide.title);
  });

  it('puts the number and its label on one baseline', () => {
    const ui = renderTest(createComponent(TextLayout, {}), { width: 520, height: 400 });
    const number = ui.getLayout(ui.getByText('1,284'));
    const label = ui.getLayout(ui.getByText('words measured'));

    // Two different font sizes: aligned on their boxes they would share
    // a top or a centre, and they share neither.
    expect(number.height).toBeGreaterThan(label.height);
    expect(label.y).toBeGreaterThan(number.y);
    expect(label.y + label.height).toBeLessThanOrEqual(number.y + number.height);
  });
});
