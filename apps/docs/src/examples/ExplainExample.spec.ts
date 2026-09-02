import { describe, expect, it } from 'vitest';

import { createComponent } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { Vanished } from './ExplainExample';

const SIZE = { width: 420, height: 260 };

function example(): Rendered {
  return renderTest(createComponent(Vanished, {}), SIZE);
}

/**
 * What the page claims: `explain` names the one rule that fixed each
 * axis and says in words why the number is what it is, the sentences
 * change when the cause does, and a missed `toHaveBox` prints the same
 * answer next to the assertion.
 */
describe('the docs explain example', () => {
  it('names the rule that took the title to nothing', () => {
    const ui = example();
    const title = ui.getByLabel('title');
    const explanation = ui.explain(title);

    expect(explanation.laidOut).toBe(true);
    expect(explanation.width.final).toBe(0);
    expect(explanation.width.decidedBy).toBe('flex');
    expect(explanation.width.reasons.join(' ')).toContain('shrank to 0');
    expect(explanation.width.reasons.join(' ')).toContain('automatic minimum is 0');
    // The height was decided by something else entirely, and says so.
    expect(explanation.height.decidedBy).toBe('stretch');
  });

  it('prints the same answer as sentences', () => {
    const ui = example();
    const lines = ui.explainText(ui.getByLabel('title')).split('\n');

    // The page quotes this readout, so it is pinned here rather than
    // described: a change of wording in the engine has to reach the page.
    // The first line names the node and prints its border box.
    expect(lines[0]).toContain("text 'root:0:0:0:1'");
    expect(lines[0]).toContain('0 × 28 at (330, 79.6)');
    expect(lines.slice(1)).toEqual([
      "width  0       flex item of row 'root:0:0:0': base 124.8 from its max-content width; shrank to 0 " +
        "(flexShrink 1: the items' base sizes exceed the content box of row 'root:0:0:0', so they give up space); " +
        'its automatic minimum is 0: a scroll container or clipped text has none, so it may shrink to nothing; ' +
        'its content would need 70.2; the extra 70.2 is clipped',
      "height 28      stretched across row 'root:0:0:0': 28; its content would need 31.2; the extra 3.2 is clipped",
      "constraints from row 'root:0:0:0': width 0 (tight) · height 28 (tight)",
      'padding 0 · margin 0 · content box 0 × 28',
      "relayout: not a boundary · content matters to the parent · a change here is laid out from row 'root:0:0:0' " +
        '(1 level up)',
      'state: measured · placed · position static'
    ]);
  });

  it('changes its answer when the cause changes', () => {
    const ui = example();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Let the badge shrink' }));
    ui.frame();

    const explanation = ui.explain(ui.getByLabel('title'));
    // Still a flex item, still shrunk, but no longer to nothing: the
    // badge is now giving up space of its own.
    expect(explanation.width.decidedBy).toBe('flex');
    expect(explanation.width.final).toBeGreaterThan(0);
    expect(ui.explainText(ui.getByLabel('title'))).not.toContain('shrank to 0');
    expect(ui.textOf()).not.toContain('The title is 0 px wide.');
  });

  it('reports the width the example draws on screen', () => {
    const ui = example();

    // The `measure` modifier is what puts the number in the canvas, so
    // the reader is looking at the same value `explain` is talking about.
    expect(ui.textOf()).toContain('The title is 0 px wide.');
  });

  it('hands the explanation to a failed assertion', () => {
    const ui = example();
    const title = ui.getByLabel('title');

    let message = '';
    try {
      expect(title).toHaveBox({ width: 120 });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain(
      `Expected 'root:0:0:0:1' to have width 120, but its box is {"x":330,"y":79.6,"width":0,"height":28}.`
    );
    expect(message).toContain('Why:');
    // Not a summary of the explanation: the explanation.
    expect(message).toContain(ui.explainText(title));
  });
});
