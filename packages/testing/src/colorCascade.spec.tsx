import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject, type Observable } from 'rxjs';

import {
  darkTheme,
  lightTheme,
  percent,
  transform,
  withContrast,
  type UiColor,
  type UiColorValue,
  type UiTheme
} from 'gesso-core';

import { renderTest, type Rendered } from './renderTest';

/**
 * `color` cascades: text that names no colour takes the nearest
 * ancestor's, and a palette name is resolved against the theme where
 * the text is painted.
 *
 * Found in an application whose root was
 * `<box theme={theme} backgroundColor="background" color="text">`
 * over a dark theme: every text that named a role came out light, and
 * every text that named nothing came out in the default style's
 * near-black on the dark background, because `color` was inherited
 * only from the nearest text style and a node's own `color` was
 * provided to nothing below it.
 */

let ui: Rendered;
afterEach(() => ui?.unmount());

/** What each string was filled with, read off the recorded draw calls. */
function inks(): Map<string, string> {
  const out = new Map<string, string>();
  let style = '';
  for (const call of ui.draws) {
    if (call.name === 'set:fillStyle') {
      style = String(call.args[0]);
    } else if (call.name === 'fillText') {
      out.set(String(call.args[0]), style);
    }
  }
  return out;
}

function hex(color: UiColor): string {
  return `#${[color.r, color.g, color.b]
    .map(channel =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

describe('color cascade', () => {
  it('reaches plain text through a transformed, absolutely placed layer and a button', async () => {
    // The shape the application had: an Observable theme that starts
    // light and turns dark once the shell reports the system's
    // setting, and text several layers down that names no colour.
    const theme = new BehaviorSubject<UiTheme>(withContrast(lightTheme, 'standard'));
    ui = renderTest(
      <box width={percent(100)} height={percent(100)} theme={theme} backgroundColor="background" color="text">
        <text text="plain" />
        <box position="relative" overflow="hidden" width={300} height={200}>
          <box
            position="absolute"
            left={0}
            top={0}
            width={300}
            height={200}
            transform={transform({ scaleX: 2, scaleY: 2 })}>
            <text text="lane" />
            <button label="card">
              <text text="key" fontSize={30} fontWeight={700} />
            </button>
          </box>
        </box>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    expect(inks().get('plain')).toBe(hex(lightTheme.colors.text));

    theme.next(withContrast(darkTheme, 'standard'));
    ui.clearDraws();
    await ui.settle();
    const dark = hex(darkTheme.colors.text);
    expect(inks().get('plain')).toBe(dark);
    expect(inks().get('lane')).toBe(dark);
    expect(inks().get('key')).toBe(dark);
  });

  it('resolves a cascaded name against a theme provided further down', async () => {
    // The name travels, not the colour it named where it was set: a
    // dark card inside a light page paints its plain text dark-on-dark
    // the right way round.
    ui = renderTest(
      <box theme={lightTheme} color="text">
        <text text="page" />
        <box theme={darkTheme}>
          <text text="card" />
        </box>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    expect(inks().get('page')).toBe(hex(lightTheme.colors.text));
    expect(inks().get('card')).toBe(hex(darkTheme.colors.text));
  });

  it('gives way to a nearer text style, and to a colour the text names itself', async () => {
    ui = renderTest(
      <box theme={darkTheme} color="danger">
        <text text="inherited" />
        <text text="own" color="primary" />
        <box textStyle="title">
          <text text="styled" />
        </box>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    expect(inks().get('inherited')).toBe(hex(darkTheme.colors.danger));
    expect(inks().get('own')).toBe(hex(darkTheme.colors.primary));
    expect(inks().get('styled')).toBe(hex(darkTheme.typography.title.color));
  });

  it('repaints the subtree when a colour arrives or changes, without laying it out again', async () => {
    // Starts unset, so the first step is the box gaining a colour it
    // did not provide before, and the second a colour it did changing.
    const ink = new BehaviorSubject<string | undefined>(undefined);
    ui = renderTest(
      // The prop's type has no `undefined`, but a binding that emits
      // one removes the property, which is the state to start from.
      <box theme={darkTheme} color={ink as Observable<UiColorValue>}>
        <column>
          <text text="below" />
        </column>
      </box>,
      { width: 400, height: 300 }
    );
    await ui.settle();
    const framesBefore = ui.frames.length;

    ink.next('danger');
    ui.clearDraws();
    await ui.settle();
    expect(inks().get('below')).toBe(hex(darkTheme.colors.danger));
    // Re-providing the colour dirties the subtree for paint alone: a
    // colour cannot move a line, and a hover that animates one would
    // otherwise lay out everything under it every frame.
    const arrived = ui.frames.slice(framesBefore);
    expect(arrived.length).toBeGreaterThan(0);
    expect(arrived.every(frame => frame.layoutPasses === 0)).toBe(true);

    const framesBetween = ui.frames.length;
    ink.next('text');
    ui.clearDraws();
    await ui.settle();
    expect(inks().get('below')).toBe(hex(darkTheme.colors.text));
    const changed = ui.frames.slice(framesBetween);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(frame => frame.layoutPasses === 0)).toBe(true);
  });
});
