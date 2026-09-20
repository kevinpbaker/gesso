import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Text, defineThemeExtension, lightTheme, withThemeExtension, type UiChild } from 'gesso-core';
import { renderTest } from 'gesso-testing';
import { createComponent, themeTokenCell } from 'gesso-framework';

import { Button } from './Button';
import { NumberInput } from './NumberInput';
import { TextInput } from './TextInput';
import { controlTokens, type ControlTokens } from './tokens';

interface Metrics {
  readonly pad: number;
  readonly ink: string;
}

const metrics = defineThemeExtension<Metrics>({
  name: 'spec.metrics',
  defaults: { pad: 4, ink: 'controlForeground' }
});

/** A control that reads its padding and its label's colour from the theme. */
function Padded(): UiChild {
  const tokens = themeTokenCell(metrics);
  return Box(
    {
      modifiers: [tokens.modifier],
      paddingX: tokens.select(t => t.pad)
    },
    Text({ text: 'inside', color: tokens.select(t => t.ink) })
  );
}

describe('themeTokenCell', () => {
  it('starts at the extension defaults and keeps them when nothing provides the group', () => {
    const ui = renderTest(createComponent(Padded), { width: 200, height: 200 });
    expect(ui.getByText('inside').parent!.properties.get('paddingX')).toBe(4);
  });

  it('takes the values a theme above it carries', () => {
    const themed = withThemeExtension(lightTheme, metrics, { pad: 21, ink: 'danger' });
    const ui = renderTest(Box({ theme: themed }, createComponent(Padded)), { width: 200, height: 200 });
    expect(ui.getByText('inside').parent!.properties.get('paddingX')).toBe(21);
  });

  it('reaches a child, which is the case `host.set` cannot serve', () => {
    // `color` does not cascade from a parent node, so a label's colour
    // has to be bound on the label. The cell is an ordinary Observable,
    // so it can be.
    const themed = withThemeExtension(lightTheme, metrics, { pad: 4, ink: 'danger' });
    const ui = renderTest(Box({ theme: themed }, createComponent(Padded)), { width: 200, height: 200 });
    expect(ui.getByText('inside').properties.get('color')).toBe('danger');
  });

  it('follows a theme that changes after the first frame', () => {
    // Bound, the way an appearance toggle actually provides one: a
    // raw `setProperty` on a node does not tell the graph, so it would
    // test the harness rather than the modifier.
    const first = withThemeExtension(lightTheme, metrics, { pad: 2, ink: 'controlForeground' });
    const second = withThemeExtension(lightTheme, metrics, { pad: 30, ink: 'controlAccent' });
    const theme = new BehaviorSubject(first);
    const ui = renderTest(Box({ theme }, createComponent(Padded)), { width: 200, height: 200 });
    const box = ui.getByText('inside').parent!;
    expect(box.properties.get('paddingX')).toBe(2);

    theme.next(second);
    ui.frame();

    expect(box.properties.get('paddingX')).toBe(30);
    expect(ui.getByText('inside').properties.get('color')).toBe('controlAccent');
  });
});

describe('restyling the library through the theme', () => {
  /** The stock defaults, with one group replaced. */
  function restyled(change: (base: ControlTokens) => ControlTokens) {
    return withThemeExtension(lightTheme, controlTokens, change(controlTokens.defaults));
  }

  it('gives a Button the padding, radius and type the theme names', () => {
    const theme = restyled(base => ({
      ...base,
      button: {
        ...base.button,
        sizes: { ...base.button.sizes, medium: { paddingX: 40, paddingY: 30, radius: 0, textStyle: 'headline' } }
      }
    }));
    const ui = renderTest(Box({ theme }, createComponent(Button, { label: 'Save' })), { width: 400, height: 400 });
    const button = ui.getByRole('button');
    expect(button.properties.get('paddingX')).toBe(40);
    expect(button.properties.get('paddingY')).toBe(30);
    expect(button.properties.get('borderRadius')).toBe(0);
    expect(ui.getByText('Save').properties.get('textStyle')).toBe('headline');
  });

  it('lets a variant be remapped onto different palette tokens', () => {
    // The thing a palette alone could not do: an application could
    // change what `controlAccent` is, but not that a filled accent
    // button should use it.
    const theme = restyled(base => ({
      ...base,
      button: {
        ...base.button,
        paint: {
          ...base.button.paint,
          filled: { ...base.button.paint.filled, accent: { background: 'secondary', foreground: 'surface' } }
        }
      }
    }));
    const ui = renderTest(Box({ theme }, createComponent(Button, { label: 'Go', tone: 'accent' })), {
      width: 400,
      height: 400
    });
    expect(ui.getByRole('button').properties.get('backgroundColor')).toBe('secondary');
    expect(ui.getByText('Go').properties.get('color')).toBe('surface');
  });

  it('lets the theme say how far a filled button dims under the pointer', () => {
    const theme = restyled(base => ({ ...base, button: { ...base.button, hoveredOpacity: 0.5 } }));
    const ui = renderTest(Box({ theme }, createComponent(Button, { label: 'Dim' })), { width: 400, height: 400 });
    const button = ui.getByRole('button');
    const box = ui.getLayout(button);
    ui.fireEvent.pointerMove(box.x + box.width / 2, box.y + box.height / 2);
    ui.frame();
    expect(button.properties.get('opacity')).toBe(0.5);
  });

  it('leaves a button under no provider exactly as it was', () => {
    // The migration's own guarantee: the defaults are what the library
    // drew before, so converting a component moves no pixel.
    const ui = renderTest(createComponent(Button, { label: 'Stock' }), { width: 400, height: 400 });
    const button = ui.getByRole('button');
    expect(button.properties.get('paddingX')).toBe(12);
    expect(button.properties.get('paddingY')).toBe(8);
    expect(button.properties.get('borderRadius')).toBe(8);
    expect(button.properties.get('backgroundColor')).toBe('controlForeground');
    expect(ui.getByText('Stock').properties.get('textStyle')).toBe('body');
  });
});

describe('one radius group, many widgets', () => {
  it('squares off every field from a single token', () => {
    // The shape §2.3 asked for: named for the role a box plays, not
    // for the widget it is in, so a theme that squares its inputs does
    // not have to know which components exist.
    const theme = withThemeExtension(lightTheme, controlTokens, {
      ...controlTokens.defaults,
      radius: { ...controlTokens.defaults.radius, field: 0 }
    });
    const ui = renderTest(
      Box({ theme }, createComponent(TextInput, { label: 'Name' }), createComponent(NumberInput, { label: 'Count' })),
      { width: 400, height: 400 }
    );
    for (const node of [ui.getByRole('textbox'), ui.getByRole('spinbutton')]) {
      expect(node.properties.get('borderRadius')).toBe(0);
    }
  });

  it('still draws the stock radii when nothing provides the group', () => {
    const ui = renderTest(createComponent(TextInput, { label: 'Name' }), { width: 400, height: 400 });
    expect(ui.getByRole('textbox').properties.get('borderRadius')).toBe(6);
  });
});
