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
let selections: ({ start: number; end: number } | null)[] = [];
let htmlCalls = 0;
afterEach(() => ui?.unmount());

const TEXTS = ['First paragraph', 'Second paragraph', 'Third paragraph'];

/** Panned by (100, 50) and zoomed to 2 about the document's top-left corner, the root's. */
const CAMERA = { x: 0, y: 0, translateX: 100, translateY: 50, scaleX: 2, scaleY: 2, rotation: 0 };

function Document(
  inputs: Inputs<{ copyText?: boolean; copyHtml?: boolean; zoomed?: boolean }>,
  _ctx: ComponentContext
) {
  const group = {
    onEdit: (edit: UiGroupEdit) => void edits.push(edit),
    onSelectionChange: (selection: { start: { offset: number }; end: { offset: number } } | null) =>
      void selections.push(selection === null ? null : { start: selection.start.offset, end: selection.end.offset }),
    ...(inputs.copyText.value === true
      ? { copyText: (start: { offset: number }, end: { offset: number }) => `copied ${start.offset}-${end.offset}` }
      : {}),
    ...(inputs.copyHtml.value === true
      ? {
          copyHtml: (start: { offset: number }, end: { offset: number }) => {
            htmlCalls++;
            return `<b>${start.offset}-${end.offset}</b>`;
          }
        }
      : {})
  };
  return (
    <column
      width={percent(100)}
      height={percent(100)}
      gap={20}
      {...(inputs.zoomed.value === true ? { transform: CAMERA } : {})}>
      <column gap={10} padding={10} width={300} editingGroup={group}>
        {TEXTS.map((text, i) => (
          <editabletext key={String(i)} value={text} label={`p${i}`} multiline={true} width={percent(100)} />
        ))}
        <button
          label="tool"
          width={40}
          height={20}
          onClick={() => void edits.push({ inputType: 'tool' } as UiGroupEdit)}
        />
      </column>
      <editabletext value="Outside" label="outside" width={300} />
    </column>
  );
}

async function mount(copyText = false, copyHtml = false, zoomed = false): Promise<void> {
  edits = [];
  selections = [];
  htmlCalls = 0;
  ui = renderTest(createComponent(Document, { copyText, copyHtml, zoomed }), { width: 600, height: 400 });
  await ui.settle();
}

const field = (label: string): UiNode => ui.getByLabel(label);

/** Where `CAMERA` draws a laid-out box. */
function drawn(box: { x: number; y: number; width: number; height: number }) {
  return { x: 100 + 2 * box.x, y: 50 + 2 * box.y, width: 2 * box.width, height: 2 * box.height };
}

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

  it('tells the group when a selection across fields begins, moves and ends', async () => {
    await mount();
    await caretIn('p0', 4);
    await press('ArrowDown', { shift: true });
    await press('ArrowRight', { shift: true });
    await press('ArrowLeft');
    expect(selections.at(0)?.start).toBe(4);
    expect(selections.length).toBeGreaterThanOrEqual(3);
    expect(selections.at(-1)).toBeNull();
  });

  it('can be set from code, across fields or in one', async () => {
    await mount();
    expect(ui.runtime.input.editing.select({ node: field('p0'), offset: 2 }, { node: field('p2'), offset: 3 })).toBe(
      true
    );
    await ui.settle();
    expect(lit()).toEqual({
      p0: { start: 2, end: TEXTS[0]!.length },
      p1: { start: 0, end: TEXTS[1]!.length },
      p2: { start: 0, end: 3 }
    });
    expect(editorFor(field('p2')).focused).toBe(true);
    expect(ui.runtime.input.editing.select({ node: field('p1'), offset: 1 }, { node: field('p1'), offset: 4 })).toBe(
      true
    );
    await ui.settle();
    expect(lit()).toEqual({ p0: undefined, p1: undefined, p2: undefined });
    expect([editorFor(field('p1')).start, editorFor(field('p1')).end]).toEqual([1, 4]);
    expect(
      ui.runtime.input.editing.select({ node: field('p0'), offset: 0 }, { node: field('outside'), offset: 1 })
    ).toBe(false);
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

  it('drags into the field the pointer is over where the fields are drawn, under a panned, zoomed parent', async () => {
    // The drag's height was compared with the fields' records, so over
    // the middle field on screen it was past the last field's record and
    // selected into the last field.
    await mount(false, false, true);
    const first = drawn(ui.getLayout(field('p0')));
    const middle = drawn(ui.getLayout(field('p1')));
    ui.fireEvent.pointerDown(first.x + 4, first.y + first.height / 2);
    ui.fireEvent.pointerMove(middle.x + 60, middle.y + middle.height / 2, { buttons: 1 });
    ui.fireEvent.pointerUp(middle.x + 60, middle.y + middle.height / 2);
    await ui.settle();
    expect(lit().p1?.start).toBe(0);
    expect(lit().p1?.end).toBeLessThan(TEXTS[1]!.length);
    expect(lit().p2).toBeUndefined();
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

  describe('Tab', () => {
    const focused = (): string | null => {
      const node = ui.runtime.input.focus.focusedNode;
      return node === null ? null : ((node.properties.get('label') as string | undefined) ?? null);
    };

    it('stops once at a group of fields, not at each field', async () => {
      await mount();
      await caretIn('p0', 0);
      await press('Tab');
      // Past the group's other fields, to the button inside it, then out.
      expect(focused()).toBe('tool');
      await press('Tab');
      expect(focused()).toBe('outside');
    });

    it('comes back into the group at the field it left', async () => {
      await mount();
      await caretIn('p1', 2);
      await press('Tab');
      await press('Tab');
      expect(focused()).toBe('outside');
      await press('Tab', { shift: true });
      await press('Tab', { shift: true });
      expect(focused()).toBe('p1');
    });
  });

  describe('a press on none of its fields', () => {
    async function pressAt(x: number, y: number): Promise<void> {
      ui.fireEvent.pointerDown(x, y);
      ui.fireEvent.pointerUp(x, y);
      await ui.settle();
    }
    const focused = (): string | null => {
      const node = ui.runtime.input.focus.focusedNode;
      return node === null ? null : ((node.properties.get('label') as string | undefined) ?? null);
    };

    it('lands in the nearest field: between two, below the last, beside one', async () => {
      await mount();
      const [p0, p1, p2] = ['p0', 'p1', 'p2'].map(label => ui.getLayout(field(label)));
      // In the gap, nearer the field above.
      await pressAt(p0!.x + 20, p0!.y + p0!.height + 3);
      expect(focused()).toBe('p0');
      // Below the last field, in the group's padding: the end of its text.
      await pressAt(p2!.x + 280, p2!.y + p2!.height + 4);
      expect(focused()).toBe('p2');
      expect(editorFor(field('p2')).focus).toBe(TEXTS[2]!.length);
      // In the padding beside a field, at its height.
      await pressAt(p1!.x - 5, p1!.y + p1!.height / 2);
      expect(focused()).toBe('p1');
      expect(editorFor(field('p1')).focus).toBe(0);
    });

    it('lands in the field nearest where the fields are drawn, under a panned, zoomed parent', async () => {
      // A press is in canvas space and the fields' records are where
      // they would be drawn at zoom 1 with no pan, so measured against
      // the records a press in the gap below the first field on screen
      // was nearest the last field.
      await mount(false, false, true);
      const [p0] = ['p0'].map(label => drawn(ui.getLayout(field(label))));
      await pressAt(p0!.x + 40, p0!.y + p0!.height + 6);
      expect(focused()).toBe('p0');
    });

    it('leaves a press on something that answers presses itself, and one outside the group', async () => {
      await mount();
      await caretIn('p0', 2);
      // Outside the group: nothing moves to its nearest field, p2.
      await pressAt(450, 380);
      expect(focused()).toBe('p0');
      // The button below p2 has its press, and p2 doesn't take it.
      const tool = ui.getLayout(ui.getByLabel('tool'));
      await pressAt(tool.x + 5, tool.y + 5);
      expect(edits.at(-1)?.inputType).toBe('tool');
      expect(focused()).not.toBe('p2');
    });
  });

  it("copies as the group's own text when it says what that is", async () => {
    await mount(true);
    await caretIn('p0', 3);
    await press('ArrowDown', { shift: true });
    expect(ui.runtime.editingState!.text).toMatch(/^copied 3-\d+$/);
  });

  it("copies the group's HTML beside the text, across fields and inside one", async () => {
    await mount(false, true);
    await caretIn('p0', 3);
    expect(ui.runtime.editingState!.html).toBeUndefined();
    await press('ArrowRight', { shift: true });
    expect(ui.runtime.editingState!.html).toBe('<b>3-4</b>');
    await press('ArrowDown', { shift: true });
    expect(ui.runtime.editingState!.html).toMatch(/^<b>3-\d+<\/b>$/);
    // Asked once per selection, not once per frame.
    const calls = htmlCalls;
    ui.runtime.resize(610, 400);
    await ui.settle();
    expect(htmlCalls).toBe(calls);
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
