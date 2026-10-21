import { afterEach, describe, expect, it } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';

import { mentionCompletions, referenceCompletions } from './completion';
import type { InlineRun } from './inline';
import { RichTextView } from './RichTextView';

let ui: Rendered;
afterEach(() => ui?.unmount());

/** Every run of styled text the view drew, in order. */
const runs = (): InlineRun[] => ui.allNodes().flatMap(node => (node.properties.get('spans') ?? []) as InlineRun[]);

describe('markdown, drawn read-only', () => {
  const MARKDOWN = '## Steps\n\n- one **two**\n\nAsked by @ada, see WEB-12';

  it('draws the formatting without its markers', async () => {
    ui = renderTest(createComponent(RichTextView, { value: MARKDOWN }), { width: 600, height: 400 });
    await ui.settle();
    const drawn = runs().map(run => run.text);
    expect(drawn).toContain('two');
    expect(drawn.join('')).not.toContain('**');
    expect(runs().find(run => run.text === 'two')).toMatchObject({ fontWeight: 700 });
    // Without sources, a mention and a key are only text.
    expect(drawn).toContain('Asked by @ada, see WEB-12');
  });

  it('draws the tokens of the sources it is given as chips', async () => {
    const completions = [mentionCompletions([]), referenceCompletions({ prefixes: [], search: async () => [] })];
    ui = renderTest(createComponent(RichTextView, { value: MARKDOWN, completions }), { width: 600, height: 400 });
    await ui.settle();
    expect(runs().find(run => run.text === 'ada')).toMatchObject({
      fontWeight: 600,
      backgroundColor: 'controlBackground'
    });
    expect(runs().find(run => run.text === 'WEB-12')).toMatchObject({ fontWeight: 600 });
  });
});
