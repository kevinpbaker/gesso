import { describe, expect, it } from 'vitest';

import { createPaintState, lightTheme, resolvePaintState, type UiNode } from '@gesso/core';
import { createComponent } from '@gesso/framework';
import { renderTest } from '@gesso/testing';
import '@gesso/testing/matchers';

import { SCALES, TypeScale } from './TypographyExample';

const AMBIENT = 'This line names no style, so it is body text.';
const OWN_SIZE = 'This line names its own size, so the scale does not decide it.';

/** What the renderer would paint for a node: the style already resolved. */
const paint = (node: UiNode) => resolvePaintState(node, createPaintState());

const shipped = lightTheme.typography;
const application = SCALES[1]!.build(shipped);

/**
 * The page's claims: a style provided above reaches text that names
 * nothing, each role is provided for its own row, swapping the scale
 * moves both the resolved style and the measured box, and a value on
 * the node itself still wins.
 */
describe('the docs typography example', () => {
  it('gives text that names no style the scale in the environment', () => {
    const ui = renderTest(createComponent(TypeScale, {}), { width: 520, height: 420 });
    const ambient = paint(ui.getByText(AMBIENT));

    expect(ambient.fontSize).toBe(shipped.body.fontSize);
    expect(ambient.lineHeight).toBe(shipped.body.lineHeight);
    expect(ambient.fontFamily).toBe(shipped.body.fontFamily);
    expect(ambient.textColor).toEqual(shipped.body.color);

    // And each row's sample takes the role its own box provides.
    expect(paint(ui.getByText('headline')).fontSize).toBe(shipped.headline.fontSize);
    expect(paint(ui.getByText('label')).letterSpacing).toBe(shipped.label.letterSpacing);
    expect(paint(ui.getByText('headline')).fontSize).toBeGreaterThan(paint(ui.getByText('bodySmall')).fontSize);
  });

  it('moves the samples when the provided scale changes, and re-measures them', () => {
    const ui = renderTest(createComponent(TypeScale, {}), { width: 520, height: 420 });
    const headline = ui.getByText('headline');
    const ambient = ui.getByText(AMBIENT);
    const before = ui.getLayout(headline).height;

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The same nodes: a scale is a property write, not a rebuild.
    expect(ui.getByText('headline')).toBe(headline);
    expect(paint(headline).fontSize).toBe(application.headline.fontSize);
    expect(paint(headline).fontFamily).toBe('Georgia, serif');
    expect(paint(ambient).fontSize).toBe(application.body.fontSize);

    // A font size is a layout input, so the box grew with it.
    expect(ui.getLayout(headline).height).toBeGreaterThan(before);
  });

  it('lets a value on the node itself win over the scale', () => {
    const ui = renderTest(createComponent(TypeScale, {}), { width: 520, height: 420 });
    const named = ui.getByText(OWN_SIZE);

    expect(paint(named).fontSize).toBe(12);

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // The scale moved underneath it, and the size it states did not.
    expect(paint(named).fontSize).toBe(12);
    // The rest of it still came from the scale.
    expect(paint(named).fontFamily).toBe(application.body.fontFamily);
  });
});
