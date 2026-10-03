import { afterEach, describe, expect, it } from 'vitest';

import { editorFor, percent, type UiGroupEdit, type UiNode } from 'gesso-core';
import { createComponent, type ComponentContext, type Inputs } from 'gesso-framework';

import { renderTest } from './renderTest';
import type { Rendered } from './renderTest';

/**
 * A selection across the fields of an editing group: a document editor
 * of three paragraphs, each its own field, with a plain field outside
 * the group to show it is left alone.
 */

let ui: Rendered;
let edits: UiGroupEdit[] = [];
afterEach(() => ui?.unmount());

const TEXTS = ['First paragraph', 'Second paragraph', 'Third paragraph'];

function Document(inputs: Inputs<{ copyText?: boolean }>, _ctx: ComponentContext) {
  const group = {
    onEdit: (edit: UiGroupEdit) => void edits.push(edit),
    ...(inputs.copyText.value === true
      ? { copyText: (start: { offset: number }, end: { offset: number }) => `copied ${start.offset}-${end.offset}` }
      : {})
  };
  return (
    <column width={percent(100)} height={percent(100)} gap={20}>
      <column gap={10} padding={10} width={300} editingGroup={group}>
        {TEXTS.map((text, i) => (
          <editabletext key={String(i)} value={text} label={`p${i}`} multiline={true} width={percent(100)} />
        ))}
      </column>
      <editabletext value="Outside" label="outside" width={300} />
    </column>
  );
}

async function mount(copyText = false): Promise<void> {
  edits = [];
  ui = renderTest(createComponent(Document, { copyText }), { width: 600, height: 400 });
  await ui.settle();
}

const field = (label: string): UiNode => ui.getByLabel(label);

async function caretIn(label: string, offset: number): Promise<void> {
  ui.fireEvent.focus(field(label));
  editorFor(field(label)).select(offset, offset);
  await ui.settle();
}

async function press(key: string, modifiers: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(key, modifiers);
  await ui.settle();
}

/** What each field draws as selected, by label. */
function lit(): Record<string, { start: number; end: number } | undefined> {
  const out: Record<string, { start: number; end: number } | undefined> = {};
  for (const label of ['p0', 'p1', 'p2']) {
    out[label] = field(label).properties.get('textSelection') as { start: number; end: number } | undefined;
  }
  return out;
}

describe('a selection across the fields of an editing group', () => {
  it('extends off the end of one field into the next with Shift and an arrow', async () => {
    await mount();
    await caretIn('p0', 6);
    await press('ArrowDown', { shift: true });
    await press('ArrowRight', { shift: true });
    await press('ArrowRight', { shift: true });
    await press('ArrowRight', { shift: true });

    expect(lit().p0).toEqual({ start: 6, end: TEXTS[0]!.length });
    expect(lit().p1).toBeDefined();
    expect(lit().p2).toBeUndefined();
    // The shell is handed the whole selection, so native copy takes it all.
    const state = ui.runtime.editingState!;
    expect(state.text.startsWith('paragraph\n')).toBe(true);
    expect([state.selectionStart, state.selectionEnd]).toEqual([0, state.text.length]);
  });

  it('extends back again and collapses into one field when the ends meet', async () => {
    await mount();
    await caretIn('p1', 3);
    await press('ArrowUp', { shift: true });
    expect(lit().p0).toBeDefined();
    await press('ArrowDown', { shift: true });
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
  });

  it('hands typing over the selection to the group, and changes no field', async () => {
    await mount();
    await caretIn('p0', 6);
    await press('ArrowDown', { shift: true });
    await press('ArrowDown', { shift: true });
    ui.fireEvent.type('X');
    await ui.settle();

    expect(edits).toHaveLength(1);
    const [edit] = edits;
    expect(edit!.inputType).toBe('insertText');
    expect(edit!.data).toBe('X');
    expect([edit!.start.node, edit!.start.offset]).toEqual([field('p0'), 6]);
    expect(edit!.end.node).toBe(field('p2'));
    expect(TEXTS.map((_, i) => editorFor(field(`p${i}`)).text)).toEqual(TEXTS);
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
  });

  it('hands Backspace and Enter over it to the group too', async () => {
    await mount();
    await caretIn('p0', 2);
    await press('ArrowDown', { shift: true });
    await press('Backspace');
    await caretIn('p1', 2);
    await press('ArrowDown', { shift: true });
    await press('Enter');
    expect(edits.map(edit => edit.inputType)).toEqual(['deleteContentBackward', 'insertLineBreak']);
  });

  it("hands a paste over it to the group, with the clipboard's HTML", async () => {
    await mount();
    await caretIn('p0', 2);
    await press('ArrowDown', { shift: true });
    ui.fireEvent.paste('one', '<b>one</b>');
    await ui.settle();
    expect(edits.at(-1)).toMatchObject({ inputType: 'insertFromPaste', data: 'one', html: '<b>one</b>' });
  });

  it('selects the whole group with select all', async () => {
    await mount();
    await caretIn('p1', 0);
    await press('a', { ctrl: true });
    expect(lit()).toEqual({
      p0: { start: 0, end: TEXTS[0]!.length },
      p1: { start: 0, end: TEXTS[1]!.length },
      p2: { start: 0, end: TEXTS[2]!.length }
    });
  });

  it('collapses to the side an unshifted arrow points to', async () => {
    await mount();
    await caretIn('p0', 6);
    await press('ArrowDown', { shift: true });
    await press('ArrowLeft');
    expect(lit().p0).toBeUndefined();
    expect(editorFor(field('p0')).focus).toBe(6);
    expect(editorFor(field('p0')).collapsed).toBe(true);
  });

  it('drags from one field across another into a third', async () => {
    await mount();
    const first = ui.getLayout(field('p0'));
    const last = ui.getLayout(field('p2'));
    ui.fireEvent.pointerDown(first.x + 2, first.y + first.height / 2);
    ui.fireEvent.pointerMove(last.x + 30, last.y + last.height / 2, { buttons: 1 });
    ui.fireEvent.pointerUp(last.x + 30, last.y + last.height / 2);
    await ui.settle();
    expect(lit().p1).toEqual({ start: 0, end: TEXTS[1]!.length });
    expect(lit().p0?.start).toBeLessThanOrEqual(1);
    expect(lit().p2?.end).toBeGreaterThan(0);
  });

  it('extends with Shift and a press in another field', async () => {
    await mount();
    await caretIn('p0', 3);
    const last = ui.getLayout(field('p2'));
    const at = { x: last.x + last.width - 2, y: last.y + 2 };
    ui.fireEvent.pointerDown(at.x, at.y, { modifiers: { shift: true } });
    ui.fireEvent.pointerUp(at.x, at.y, { modifiers: { shift: true } });
    await ui.settle();
    expect(lit().p0).toEqual({ start: 3, end: TEXTS[0]!.length });
    expect(lit().p1).toEqual({ start: 0, end: TEXTS[1]!.length });
  });

  it('ends when focus leaves the group', async () => {
    await mount();
    await caretIn('p0', 3);
    await press('ArrowDown', { shift: true });
    ui.fireEvent.focus(field('outside'));
    await ui.settle();
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
  });

  it("copies as the group's own text when it says what that is", async () => {
    await mount(true);
    await caretIn('p0', 3);
    await press('ArrowDown', { shift: true });
    expect(ui.runtime.editingState!.text).toMatch(/^copied 3-\d+$/);
  });

  it('moves the caret between fields with the arrows, keeping its column', async () => {
    await mount();
    await caretIn('p0', 5);
    await press('ArrowDown');
    expect(editorFor(field('p1')).focused).toBe(true);
    // "First" and "Secon" are about as wide, so the column lands near 5.
    expect(Math.abs(editorFor(field('p1')).focus - 5)).toBeLessThanOrEqual(1);
    await press('ArrowDown');
    await press('ArrowUp');
    expect(editorFor(field('p1')).focused).toBe(true);
    await caretIn('p1', 0);
    await press('ArrowLeft');
    expect(editorFor(field('p0')).focused).toBe(true);
    expect(editorFor(field('p0')).focus).toBe(TEXTS[0]!.length);
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
  });

  it('leaves a field outside any group selecting as it always did', async () => {
    await mount();
    await caretIn('outside', 0);
    await press('a', { ctrl: true });
    expect(editorFor(field('outside')).end).toBe('Outside'.length);
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
  });
});
