import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { afterEach, describe, expect, it } from 'vitest';

import { editorFor, percent, type UiNode, type UiTextSpan } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { renderTest, type Rendered } from './renderTest';

/**
 * A field that hides its markup, driven the way a person drives it.
 *
 * The field styles `**bold**` as a bold word and hides the asterisks,
 * restyling on every input, which is what a markdown editor does. The
 * test measurer draws a 14px glyph 8.4px wide, so `**bold** text` is
 * nine glyphs, 75.6px, and the closing markers sit at 33.6px.
 */

const GLYPH = 8.4;

/** `**…**` as hidden markers round a bold run; everything else plain. */
function markup(text: string): UiTextSpan[] {
  const spans: UiTextSpan[] = [];
  let at = 0;
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    if (match.index > at) {
      spans.push({ text: text.slice(at, match.index) });
    }
    spans.push({ text: '**', hidden: true }, { text: match[1], fontWeight: 700 }, { text: '**', hidden: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) {
    spans.push({ text: text.slice(at) });
  }
  return spans;
}

let ui: Rendered;
afterEach(() => ui?.unmount());

function Field(inputs: Inputs<{ texts: readonly BehaviorSubject<string>[] }>, _ctx: ComponentContext) {
  const fields = inputs.texts.value.map((text, i) => (
    <editabletext
      key={String(i)}
      label={`f${i}`}
      value={text}
      spans={text.pipe(map(markup))}
      onInput={event => text.next(event.value)}
      multiline={true}
      width={percent(100)}
    />
  ));
  return (
    <column
      width={400}
      padding={0}
      gap={10}
      editingGroup={inputs.texts.value.length > 1 ? { onEdit: () => {} } : undefined}>
      {fields}
    </column>
  );
}

async function mount(
  ...values: string[]
): Promise<{ texts: BehaviorSubject<string>[]; field: (i?: number) => UiNode }> {
  const texts = values.map(value => new BehaviorSubject(value));
  ui = renderTest(createComponent(Field, { texts }), { width: 600, height: 400 });
  await ui.settle();
  return { texts, field: (i = 0) => ui.getByLabel(`f${i}`) };
}

/** A press at an x into the first line of a field. */
async function pressAt(node: UiNode, x: number, count = 1, shift = false): Promise<void> {
  const box = ui.getVisibleBox(node);
  for (let i = 0; i < count; i++) {
    ui.fireEvent.pointerDown(box.x + x, box.y + 5, { modifiers: { shift } });
    ui.fireEvent.pointerUp(box.x + x, box.y + 5, { modifiers: { shift } });
  }
  await ui.settle();
}

async function press(key: string, modifiers: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

describe('a field whose runs hide text', () => {
  it('moves the caret over hidden text and one visible character per press', async () => {
    const { field } = await mount('**bold** text');
    await pressAt(field(), 0);
    const model = editorFor(field());
    expect(model.focus).toBe(0);
    await press('ArrowRight');
    expect(model.focus).toBe(3);
    await press('End');
    for (let i = 0; i < 5; i++) {
      await press('ArrowLeft');
    }
    // Back over `text` and the space, stopping after the closing markers.
    expect(model.focus).toBe(8);
    // Then over the markers and the `d` in one press.
    await press('ArrowLeft');
    expect(model.focus).toBe(5);
  });

  it('moves by visible words', async () => {
    const { field } = await mount('**bold** text');
    await pressAt(field(), 0);
    const model = editorFor(field());
    await press('ArrowRight', { ctrl: true });
    expect(model.focus).toBe(6);
    await press('ArrowRight', { ctrl: true });
    expect(model.focus).toBe(13);
  });

  it('Backspace after `**bold**` deletes the `d` and keeps the markers', async () => {
    const { field, texts } = await mount('**bold** text');
    // Just past the closing markers' boundary: after them.
    await pressAt(field(), 4 * GLYPH + 1);
    expect(editorFor(field()).focus).toBe(8);
    await press('Backspace');
    expect(texts[0].value).toBe('**bol** text');
    await press('Backspace');
    expect(texts[0].value).toBe('**bo** text');
    expect(editorFor(field()).focus).toBe(4);
  });

  it('Delete before `**bold**` deletes the `b` and keeps the markers', async () => {
    const { field, texts } = await mount('**bold** text');
    await pressAt(field(), 0);
    await press('Delete');
    expect(texts[0].value).toBe('**old** text');
  });

  it('places a press on the side of the hidden text it lands on', async () => {
    const { field } = await mount('**bold** text');
    await pressAt(field(), 4 * GLYPH - 1);
    expect(editorFor(field()).focus).toBe(6);
    // Somewhere else between, so the next press is not a double click.
    await pressAt(field(), 300);
    await pressAt(field(), 4 * GLYPH + 1);
    expect(editorFor(field()).focus).toBe(8);
  });

  it('selects the visible word on a double click, markers inside it and all', async () => {
    // Drawn as `bold text`: the word is `bold`, though markers split it.
    const { field } = await mount('**bo**ld text');
    await pressAt(field(), GLYPH, 2);
    expect(editorFor(field()).selectedText).toBe('bo**ld');
  });

  it('extends a selection across hidden text, and the selection holds the source', async () => {
    const { field } = await mount('**bold** text');
    await pressAt(field(), 3 * GLYPH);
    for (let i = 0; i < 3; i++) {
      await press('ArrowRight', { shift: true });
    }
    // `d`, the hidden markers, the space and `t`: what a copy takes.
    expect(editorFor(field()).selectedText).toBe('d** t');
  });

  it('types after hidden text where the caret was put', async () => {
    const { field, texts } = await mount('**bold** text');
    await pressAt(field(), 4 * GLYPH - 1);
    ui.fireEvent.type('er');
    await ui.settle();
    expect(texts[0].value).toBe('**bolder** text');
  });

  it('keeps hidden text hidden while an IME composes beside it', async () => {
    const { field, texts } = await mount('**bold** text');
    await pressAt(field(), 4 * GLYPH - 1);
    const editing = ui.runtime.input.editing;
    ui.clearDraws();
    editing.compositionStart();
    editing.compositionUpdate('か', 1);
    await ui.settle();
    const model = editorFor(field());
    // The application has not heard of the composition, so its runs
    // describe the text without it; they still apply, moved to make
    // room, and the markers still take no room and are not drawn.
    expect(model.text).toBe('**boldか** text');
    expect(model.hidden).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 9 }
    ]);
    const drawn = ui.draws.filter(call => call.name === 'fillText').map(call => call.args[0]);
    expect(drawn.slice(-2)).toEqual(['boldか', ' text']);
    editing.compositionEnd('か');
    await ui.settle();
    expect(texts[0].value).toBe('**boldか** text');
    expect(model.focus).toBe(7);
  });

  it('composes over a selection with hidden text inside it, which goes with it', async () => {
    const { field, texts } = await mount('a **b** c');
    const model = editorFor(field());
    await pressAt(field(), 0);
    model.select(2, 8);
    const editing = ui.runtime.input.editing;
    editing.compositionStart();
    editing.compositionUpdate('x', 1);
    editing.compositionEnd('x');
    await ui.settle();
    expect(texts[0].value).toBe('a xc');
  });

  it('places the caret by what was drawn when the field shows its hidden text on focus', async () => {
    // A live-preview editor: markers hidden until the field has focus.
    const text = new BehaviorSubject('Some **bold** words');
    const focused = new BehaviorSubject(false);
    function Preview(_inputs: Inputs<{}>, _ctx: ComponentContext) {
      const spans = combineLatest([text, focused]).pipe(
        map(([value, shown]) => (shown ? [{ text: value }] : markup(value)))
      );
      return (
        <column width={400}>
          <editabletext
            label="preview"
            value={text}
            spans={spans}
            onInput={event => text.next(event.value)}
            onFocus={() => focused.next(true)}
            onBlur={() => focused.next(false)}
            width={percent(100)}
          />
        </column>
      );
    }
    ui = renderTest(createComponent(Preview), { width: 600, height: 400 });
    await ui.settle();
    // `Some bold wo|rds` as drawn: offset 16 in the text, though with the
    // markers showing that x is between the closing asterisks.
    await pressAt(ui.getByLabel('preview'), 12 * GLYPH + 1);
    expect(focused.value).toBe(true);
    expect(editorFor(ui.getByLabel('preview')).focus).toBe(16);
  });

  it('leaves for the next field of a group when only hidden text is left', async () => {
    const { field } = await mount('**bold**', 'next');
    await pressAt(field(0), 4 * GLYPH - 1);
    expect(editorFor(field(0)).focus).toBe(6);
    await press('ArrowRight');
    expect(ui.runtime.input.focus.focusedNode).toBe(field(1));
    expect(editorFor(field(1)).focus).toBe(0);
  });
});
