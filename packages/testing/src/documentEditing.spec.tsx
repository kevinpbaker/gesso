import { BehaviorSubject, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import { percent } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { renderTest } from './renderTest';

/**
 * What a frame costs in a document editor's shape: a row holding a
 * scroller, a column of a thousand auto-height editables inside it.
 *
 * Found building the issue tracker's markdown editor, where a keystroke
 * re-measured every block (6,005 nodes, 20–33 ms of layout in Chrome)
 * because a flex item was asked three questions per pass against a
 * two-entry memo. And a frame that ran no layout reported the previous
 * pass's count as its own, which made a caret blink look like a full
 * re-measure in every devtools panel reading `FrameMetrics.measured`.
 */

const third = new BehaviorSubject('Paragraph 3 with some words');

function Document(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  return (
    <row width={percent(100)} height={percent(100)}>
      <scrollview flexGrow={1} height={percent(100)}>
        <column gap={6} padding={20} width={percent(100)}>
          {Array.from({ length: 1000 }, (_, i) => (
            <box key={String(i)} width={percent(100)}>
              <editabletext
                multiline={true}
                value={i === 3 ? third : `Paragraph ${i} with some words`}
                label={`p${i}`}
                flexGrow={1}
              />
            </box>
          ))}
        </column>
      </scrollview>
    </row>
  );
}

describe('a thousand-block document', () => {
  it('re-measures a handful of nodes per keystroke, and none for a caret move', async () => {
    const ui = renderTest(createComponent(Document), { width: 900, height: 600 });
    await ui.settle();
    const since = (from: number) => ui.frames.slice(from).map(frame => frame.measured);

    let from = ui.frames.length;
    third.next('Paragraph 3 with some words!');
    await ui.settle();
    expect(Math.max(...since(from))).toBeLessThan(20);

    ui.fireEvent.focus(ui.getByLabel('p3'));
    await ui.settle();
    from = ui.frames.length;
    ui.fireEvent.type('x');
    await ui.settle();
    expect(Math.max(...since(from))).toBeLessThan(20);

    from = ui.frames.length;
    ui.fireEvent.press('ArrowLeft');
    await ui.settle();
    // A caret move is paint: no layout ran, so nothing was measured.
    expect(since(from).every(measured => measured === 0)).toBe(true);
    ui.unmount();
  });
});

describe('a parent that re-renders its children', () => {
  it('does not replay an unchanged input into a child, so nothing derived from it runs again', async () => {
    const rows = new BehaviorSubject(0);
    const block = { text: 'Unchanged' };
    let derived = 0;

    function Child(inputs: Inputs<{ block: { text: string } }>, _ctx: ComponentContext) {
      return (
        <text
          text={inputs.block.pipe(
            map(value => {
              derived += 1;
              return value.text;
            })
          )}
        />
      );
    }
    function Parent(_inputs: Inputs<{}>, _ctx: ComponentContext) {
      // Each render hands the child a new Observable of the same value,
      // which is what a list re-rendered for an insertion does.
      return <column>{rows.pipe(map(() => [<Child key="only" block={of(block)} />]))}</column>;
    }

    const ui = renderTest(createComponent(Parent), { width: 400, height: 200 });
    await ui.settle();
    const before = derived;
    rows.next(1);
    rows.next(2);
    await ui.settle();
    expect(derived).toBe(before);
    ui.unmount();
  });
});
