import { describe, expect, it } from 'vitest';

import { Button, Column, Text, selectableTextNodes, selectionRangeOf, type UiNode } from 'gesso-core';
import { createComponent, type ShellRequest } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';

import { ARTICLE, SelectableArticle } from './SelectionExample';

const SIZE = { width: 520, height: 360 };

const mount = () => renderTest(createComponent(SelectableArticle, {}), SIZE);

/** The first character of a node's first line, where a drag starts. */
function startOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box = ui.getLayout(node);
  return { x: box.x, y: box.y + 1 };
}

/**
 * Past the right end of a node's last line, where a drag that means
 * "all of this" ends. The point is outside the node, so it takes the
 * controller's nearest-selectable-node path, which is what a real drag
 * into the margin does.
 */
function endOf(ui: Rendered, node: UiNode): { x: number; y: number } {
  const box = ui.getLayout(node);
  return { x: box.x + box.width + 8, y: box.y + box.height - 1 };
}

function dragBetween(ui: Rendered, from: UiNode, to: UiNode): void {
  const start = startOf(ui, from);
  const stop = endOf(ui, to);
  ui.fireEvent.pointerDown(start.x, start.y);
  ui.fireEvent.pointerMove(stop.x, stop.y, { buttons: 1 });
  ui.fireEvent.pointerUp(stop.x, stop.y);
  ui.frame();
}

/**
 * The page claims a drag crosses node boundaries, that copy sends the
 * selected text to the shell with a newline between nodes, that
 * `selectable={false}` and a button's label stay out of it, and that
 * Escape drops the selection. Each is a test.
 */
describe('the docs selection example', () => {
  it('carries one selection across three text nodes', () => {
    const ui = mount();
    const heading = ui.getByText(ARTICLE.heading);
    const first = ui.getByText(ARTICLE.first);
    const second = ui.getByText(ARTICLE.second);

    dragBetween(ui, heading, second);

    // The first node from the press, every node between it and the
    // last one whole, and the last one up to where the pointer stopped.
    expect(selectionRangeOf(heading)).toEqual({ start: 0, end: ARTICLE.heading.length });
    expect(selectionRangeOf(first)).toEqual({ start: 0, end: ARTICLE.first.length });
    expect(selectionRangeOf(second)).toEqual({ start: 0, end: ARTICLE.second.length });

    // One newline joins one node's text to the next, which is the
    // paragraph break a reader expects when they paste it.
    expect(ui.runtime.input.selection.selectedText()).toBe(`${ARTICLE.heading}\n${ARTICLE.first}\n${ARTICLE.second}`);
  });

  it('sends the selected text to the shell on the copy shortcut', () => {
    const ui = mount();
    const requests: ShellRequest[] = [];
    ui.runtime.onShellRequest(request => requests.push(request));

    dragBetween(ui, ui.getByText(ARTICLE.heading), ui.getByText(ARTICLE.second));
    ui.fireEvent.keyDown('c', { ctrl: true });

    // A component's `copyText` and the copy shortcut make the same
    // request; the shell is the only thread that can answer it.
    expect(requests).toEqual([{ type: 'clipboard', text: `${ARTICLE.heading}\n${ARTICLE.first}\n${ARTICLE.second}` }]);
  });

  it('sends the heading when the button asks the shell for it', () => {
    const ui = mount();
    const requests: ShellRequest[] = [];
    ui.runtime.onShellRequest(request => requests.push(request));

    ui.fireEvent.click(ui.getByLabel('Copy the heading'));
    ui.frame();

    expect(requests).toEqual([{ type: 'clipboard', text: ARTICLE.heading }]);
    expect(ui.getByText('Sent to the clipboard')).toBeDefined();
  });

  it('leaves the opted-out caption and the button label out of select all', () => {
    const ui = mount();
    const caption = ui.getByText(ARTICLE.caption);
    const buttonLabel = ui.getByText('Copy the heading');

    ui.fireEvent.keyDown('a', { ctrl: true });
    ui.frame();

    expect(selectionRangeOf(ui.getByText(ARTICLE.heading))).toEqual({ start: 0, end: ARTICLE.heading.length });
    expect(selectionRangeOf(ui.getByText(ARTICLE.second))).toEqual({ start: 0, end: ARTICLE.second.length });
    // `selectable={false}`, and a `<button>` opting its own label out,
    // keep both of these out of the corpus entirely.
    expect(selectionRangeOf(caption)).toBeUndefined();
    expect(selectionRangeOf(buttonLabel)).toBeUndefined();
    expect(ui.runtime.input.selection.selectedText()).toBe(`${ARTICLE.heading}\n${ARTICLE.first}\n${ARTICLE.second}`);
  });

  it('takes a word on the second press and drops everything on Escape', () => {
    const ui = mount();
    const heading = ui.getByText(ARTICLE.heading);
    const at = startOf(ui, heading);

    ui.fireEvent.pointerDown(at.x, at.y);
    ui.fireEvent.pointerUp(at.x, at.y);
    ui.fireEvent.pointerDown(at.x, at.y);
    ui.fireEvent.pointerUp(at.x, at.y);
    ui.frame();

    // 'Selection on a canvas': the word under the press, not the line.
    expect(selectionRangeOf(heading)).toEqual({ start: 0, end: 'Selection'.length });

    ui.fireEvent.keyDown('Escape');
    ui.frame();
    expect(selectionRangeOf(heading)).toBeUndefined();
    expect(ui.runtime.input.selection.hasSelection).toBe(false);
  });

  it('lets a label inside a button opt back in', () => {
    // `selectable` is read up the ancestor chain, and the nearest
    // answer wins, so the node's own `true` beats the button's default.
    const ui = renderTest(
      Column(
        {},
        Button({ label: 'Save' }, Text({ text: 'Save' })),
        Button({ label: 'Quote' }, Text({ text: 'Quote', selectable: true }))
      ),
      SIZE
    );

    const selectable = selectableTextNodes(ui.runtime.layoutRoot()).map(node => node.properties.get('text'));
    expect(selectable).toEqual(['Quote']);
  });
});
