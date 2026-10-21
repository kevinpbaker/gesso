import { afterEach, describe, expect, it } from 'vitest';

import { editorFor } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest, textProperty, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ReleaseNote, SAMPLE } from './RichTextEditorExample';

let ui: Rendered;
afterEach(() => ui?.unmount());

async function mount(): Promise<void> {
  ui = renderTest(createComponent(ReleaseNote, {}), { width: 720, height: 580 });
  await ui.settle();
}

const stored = (): string => textProperty(ui.getByLabel('Markdown as stored')) ?? '';
const said = (): string => textProperty(ui.getByRole('status')) ?? '';
const options = (): string[] => ui.getAllByRole('option').map(option => ui.getSemantics(option).label ?? '');

/** A new, empty paragraph after the first one, with the caret in it. */
async function newLine(): Promise<void> {
  const field = ui.getAllByRole('textbox', { name: 'Paragraph' })[0]!;
  ui.fireEvent.focus(field);
  const model = editorFor(field);
  model.select(model.text.length, model.text.length);
  await ui.settle();
  await press('Enter');
}

async function press(key: string, modifiers: { shift?: boolean; meta?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

async function type(text: string): Promise<void> {
  ui.fireEvent.type(text);
  await ui.settle();
}

/**
 * The page claims the document is stored exactly as loaded, that `@`
 * offers people and writes a handle, that the tag source written on
 * the page opens on `#` and writes and announces its own text, that a
 * slash on an empty line turns it into a block, and that the markdown
 * under the editor follows every change. Each is a test.
 */
describe('the docs rich text editor example', () => {
  it('shows the sample formatted and stores it exactly as written', async () => {
    await mount();
    expect(stored()).toBe(SAMPLE);
    expect(ui.getAllByRole('textbox', { name: 'Heading level 1' })).toHaveLength(1);
    expect(ui.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('mentions someone after @ and writes their handle', async () => {
    await mount();
    await newLine();
    // A list opens for its character typed, so the query comes after it.
    await type('Thanks @');
    expect(options()).toEqual(['Ada Okafor', 'Grace Hopper', 'Kim Lee', 'Linus Park']);
    await type('gr');
    expect(options()).toEqual(['Grace Hopper']);
    await press('Enter');
    expect(said()).toBe('Mentioned Grace Hopper');
    expect(stored()).toContain('\n\nThanks @grace \n\n- [x] Port the specs');
  });

  it('tags the note after # with the source written on the page', async () => {
    await mount();
    await newLine();
    await type('Also #');
    expect(options()).toEqual(['design', 'docs', 'performance', 'release']);
    await type('slow');
    expect(options()).toEqual(['performance']);
    await press('Enter');
    expect(said()).toBe('Tagged performance');
    expect(stored()).toContain('\n\nAlso #performance \n\n');
  });

  it('turns an empty line into a block from the slash menu', async () => {
    await mount();
    await newLine();
    await type('/quo');
    await press('Enter');
    expect(said()).toBe('Turned into Quote');
    await type('Quoted');
    expect(stored()).toContain('\n\n> Quoted\n\n');
  });

  it('undoes into the markdown below it', async () => {
    await mount();
    await newLine();
    await type('draft');
    expect(stored()).not.toBe(SAMPLE);
    await press('z', { meta: true });
    await press('z', { meta: true });
    expect(stored()).toBe(SAMPLE);
  });
});
