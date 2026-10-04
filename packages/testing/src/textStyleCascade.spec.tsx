import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject, map, type Observable } from 'rxjs';

import {
  DEFAULT_LINE_HEIGHT_FACTOR,
  UiProperties,
  lightTheme,
  resolveProperty,
  type UiTextDecoration
} from 'gesso-core';

import { renderTest, type Rendered } from './renderTest';

/**
 * The text style properties cascade: `fontSize`, `fontWeight` and the
 * rest of them, set on a container, reach the text under it.
 *
 * The property reference said so, and the flex example set
 * `fontSize={12}` on a row for its items to read, but the twelve
 * properties were inherited only from the nearest `textStyle`, and a
 * node's own `fontSize` was provided to nothing below it. A text under
 * `<box fontSize={30}>` came out at the default 14.
 */

let ui: Rendered;
afterEach(() => ui?.unmount());

/** The canvas font each string was drawn in, read off the recorded calls. */
function fonts(): Map<string, string> {
  const out = new Map<string, string>();
  let font = '';
  for (const call of ui.draws) {
    if (call.name === 'set:font') {
      font = String(call.args[0]);
    } else if (call.name === 'fillText') {
      out.set(String(call.args[0]), font);
    }
  }
  return out;
}

describe('text style cascade', () => {
  it('reaches plain text from a container, with a normal line for the size it set', async () => {
    ui = renderTest(
      <box fontSize={30} fontWeight={700}>
        <column>
          <text text="plain" />
        </column>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    const text = ui.getByText('plain');
    expect(resolveProperty(text, UiProperties.fontSize)).toBe(30);
    expect(resolveProperty(text, UiProperties.fontWeight)).toBe(700);
    // The inherited 16.8px line belongs to 14px text; a size set
    // without a line height brings a normal line for itself down with
    // it, as it does on the node that set it.
    expect(resolveProperty(text, UiProperties.lineHeight)).toBeCloseTo(30 * DEFAULT_LINE_HEIGHT_FACTOR);
    expect(ui.getLayout(text).height).toBeCloseTo(30 * DEFAULT_LINE_HEIGHT_FACTOR);
    expect(fonts().get('plain')).toMatch(/\b700\b.*\b30px\b/);
  });

  it('lays fields over the style in scope, nearest first, and gives way to the text itself', async () => {
    ui = renderTest(
      <box textStyle="title" fontSize={20} lineHeight={28} letterSpacing={1} textDecoration="underline">
        <text text="over a role" />
        <box fontWeight={300} textAlign="end">
          <text text="nested" />
          <text text="own" fontSize={11} fontWeight={600} />
        </box>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    const title = lightTheme.typography.title;

    const overRole = ui.getByText('over a role');
    expect(resolveProperty(overRole, UiProperties.fontSize)).toBe(20);
    expect(resolveProperty(overRole, UiProperties.lineHeight)).toBe(28);
    expect(resolveProperty(overRole, UiProperties.fontFamily)).toBe(title.fontFamily);
    expect(resolveProperty(overRole, UiProperties.fontWeight)).toBe(title.fontWeight);

    const nested = ui.getByText('nested');
    expect(resolveProperty(nested, UiProperties.fontSize)).toBe(20);
    expect(resolveProperty(nested, UiProperties.lineHeight)).toBe(28);
    expect(resolveProperty(nested, UiProperties.letterSpacing)).toBe(1);
    expect(resolveProperty(nested, UiProperties.textDecoration)).toBe('underline');
    expect(resolveProperty(nested, UiProperties.fontWeight)).toBe(300);
    expect(resolveProperty(nested, UiProperties.textAlign)).toBe('end');

    const own = ui.getByText('own');
    expect(resolveProperty(own, UiProperties.fontSize)).toBe(11);
    expect(resolveProperty(own, UiProperties.fontWeight)).toBe(600);
    expect(ui.getLayout(own).height).toBeCloseTo(11 * DEFAULT_LINE_HEIGHT_FACTOR);
  });

  it('lays the subtree out again when a cascaded size changes, and only repaints for a decoration', async () => {
    const size = new BehaviorSubject<number | undefined>(undefined);
    const decoration = new BehaviorSubject<UiTextDecoration>('none');
    ui = renderTest(
      // A binding that emits `undefined` removes the property, which is
      // the state to start from: the box provides nothing yet.
      <box fontSize={size as Observable<number>} textDecoration={decoration}>
        <column>
          <text text="below" />
        </column>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    const text = ui.getByText('below');
    expect(resolveProperty(text, UiProperties.fontSize)).toBe(UiProperties.fontSize.defaultValue);

    size.next(24);
    await ui.settle();
    expect(resolveProperty(text, UiProperties.fontSize)).toBe(24);
    expect(ui.getLayout(text).height).toBeCloseTo(24 * DEFAULT_LINE_HEIGHT_FACTOR);

    size.next(undefined);
    await ui.settle();
    expect(resolveProperty(text, UiProperties.fontSize)).toBe(UiProperties.fontSize.defaultValue);

    // An underline cannot move a line, so re-providing one dirties the
    // subtree for paint alone, as a cascaded colour does.
    const framesBefore = ui.frames.length;
    decoration.next('underline');
    await ui.settle();
    expect(resolveProperty(text, UiProperties.textDecoration)).toBe('underline');
    const changed = ui.frames.slice(framesBefore);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(frame => frame.layoutPasses === 0)).toBe(true);
  });

  it('reaches text mounted after the container set its size', async () => {
    const show = new BehaviorSubject(false);
    ui = renderTest(
      <box fontSize={18}>
        <column>{show.pipe(map(visible => (visible ? [<text key="late" text="late" />] : [])))}</column>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    show.next(true);
    await ui.settle();
    expect(resolveProperty(ui.getByText('late'), UiProperties.fontSize)).toBe(18);
  });
});
