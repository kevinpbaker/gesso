import { describe, expect, it } from 'vitest';

import { Button, EditableText, type UiChild, type UiNode } from 'gesso-core';

import { FocusService } from '../app/FocusService';
import { InspectionService } from '../app/InspectionService';
import { mountRuntime } from '../app/RuntimeTestUtils';
import type { ComponentContext } from '../FunctionComponent';
import { OverlayScope } from './OverlayScope';

/**
 * A design tool's board: a frame drawing a screen with its dialog open,
 * beside the tool's own field. The dialog's trap is the frame's, not
 * the tool's.
 */
describe('OverlayScope', () => {
  it("keeps a dialog's trap inside it: the tool around it keeps the keyboard", () => {
    let inspection!: InspectionService;
    let focus!: FocusService;
    const typed: string[] = [];
    let dialogButton!: UiNode;
    function Board(_inputs: unknown, ctx: ComponentContext): UiChild {
      inspection = ctx.inject(InspectionService);
      focus = ctx.inject(FocusService);
      return (
        <column>
          {EditableText({ value: '', label: 'Search', onInput: event => typed.push(event.value) })}
          <box width={300} height={200}>
            <OverlayScope>
              <column
                ref={(node: UiNode | null) => {
                  if (node !== null) {
                    focus.trap(node);
                  }
                }}>
                {Button({
                  label: 'Resolve',
                  ref: (node: UiNode | null) => void (node !== null && (dialogButton = node))
                })}
              </column>
            </OverlayScope>
          </box>
        </column>
      );
    }
    const mounted = mountRuntime(<Board />);
    mounted.frame();
    mounted.frame();

    const field = inspection.nodesAt(10, 10).find(node => node.type === 'editable-text')!;
    expect(inspection.act(field, 'setValue', 'maya')).toBe(true);
    expect(typed.at(-1)).toBe('maya');
    expect(focus.focused.value).toBe(field);
    expect(focus.trapped.value).toBe(false);
    // Inside the frame, the dialog still holds it.
    expect(inspection.act(dialogButton, 'click')).toBe(true);
    expect(focus.trapped.value).toBe(true);
  });
});
