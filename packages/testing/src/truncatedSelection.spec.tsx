import { afterEach, describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import type { ShellRequest } from 'gesso-framework';

import { renderTest, type Rendered } from './renderTest';

/**
 * Copying a selection over ellipsised text, the whole way a person does
 * it: a drag on the canvas, Ctrl+C, and the clipboard request the
 * runtime hands the shell.
 *
 * An epic title cut to 'Brand Story & Brand…' copied as 'Brand Story &
 * Brand': only what was drawn. `text-overflow` is presentation in CSS,
 * and a browser copies the whole string once a selection reaches the
 * ellipsis, so that is what the clipboard should get.
 *
 * The test measurer draws a 10px glyph 6px wide, so in 120px the title
 * is nineteen glyphs, x 0..114, and an ellipsis at 114..120.
 */

const TITLE = 'Brand Story & Brand Attribute Management';

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(): { title: UiNode; copied: string[] } {
  const copied: string[] = [];
  ui = renderTest(
    <column width={400} padding={0}>
      <text label="title" text={TITLE} fontSize={10} width={120} maxLines={1} textOverflow="ellipsis" />
      <text label="after" text="next" fontSize={10} />
    </column>,
    {
      onCreate: runtime =>
        runtime.onShellRequest((request: ShellRequest) => {
          if (request.type === 'clipboard') {
            copied.push(request.text);
          }
        })
    }
  );
  return { title: ui.getByLabel('title'), copied };
}

function drag(node: UiNode, fromX: number, toX: number): void {
  const box = ui.getVisibleBox(node);
  const y = box.y + 5;
  ui.fireEvent.pointerDown(box.x + fromX, y);
  ui.fireEvent.pointerMove(box.x + toX, y);
  ui.fireEvent.pointerUp(box.x + toX, y);
  ui.frame();
}

function copy(): void {
  ui.fireEvent.press('c', { ctrl: true });
  ui.frame();
}

describe('copying ellipsised text', () => {
  it('copies the whole title once the drag reaches the ellipsis', () => {
    const { title, copied } = mount();
    drag(title, 1, 119);
    copy();
    expect(copied).toEqual([TITLE]);
  });

  it('copies only the drawn glyphs when the drag stops short of the ellipsis', () => {
    const { title, copied } = mount();
    drag(title, 1, 112);
    copy();
    expect(copied).toEqual(['Brand Story & Brand']);
  });

  it('copies the whole title under select all', () => {
    const { copied } = mount();
    ui.fireEvent.press('a', { ctrl: true });
    copy();
    expect(copied).toEqual([`${TITLE}\nnext`]);
  });
});
