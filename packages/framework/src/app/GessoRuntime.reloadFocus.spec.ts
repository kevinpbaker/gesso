import { describe, expect, it } from 'vitest';

import { Button, Column, autoFocus, type UiElement, type UiNode } from '@gesso/core';
import { Component } from '../Component';
import { Define } from '../decorators';
import { createComponent } from '../createComponent';
import { FocusService } from './FocusService';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * The two gaps `decisions/0049` recorded, closed
 * (`EXCELLENCE_ROADMAP.md` X3).
 *
 * A reload throws the tree away and builds a new one, and the record
 * was explicit that focus did not survive it: "a focused node in a
 * replaced subtree is removed, the focus manager clears, and nothing
 * puts the caret back. `autoFocus` will fire again, which for a form
 * mid-edit is worse than doing nothing."
 *
 * Both halves are one mechanism. The caret's position is read before
 * the rebuild and applied on the frame that lays the new tree out,
 * after the layout listeners, because `autoFocus` is a layout listener
 * and every node in a replaced subtree is having its first layout on
 * that frame. So the restore is the last word: it puts the caret back
 * where the person had it, and where the person had it nowhere, it
 * takes it off whatever autofocused.
 *
 * A separate file from `GessoRuntime.reload.spec.ts` because these need
 * a focusable tree and that one is about what survives a rebuild.
 */
@Define('form-screen')
class FormScreen extends Component {
  override render(): UiElement {
    return Column({}, Button({ label: 'Name' }), Button({ label: 'Email' }));
  }
}

/** The same screen from a replaced module: a different class object. */
@Define('form-screen')
class ReplacedFormScreen extends Component {
  override render(): UiElement {
    return Column({}, Button({ label: 'Name' }), Button({ label: 'Email' }));
  }
}

@Define('dialog-screen')
class DialogScreen extends Component {
  override render(): UiElement {
    return Column({}, Button({ label: 'Name' }), Button({ label: 'Email', modifiers: [autoFocus()] }));
  }
}

@Define('dialog-screen')
class ReplacedDialogScreen extends Component {
  override render(): UiElement {
    return Column({}, Button({ label: 'Name' }), Button({ label: 'Email', modifiers: [autoFocus()] }));
  }
}

function focusedLabel(runtime: { services: { get(service: typeof FocusService): FocusService } }): string | undefined {
  return runtime.services.get(FocusService).focused.value?.properties.get('label') as string | undefined;
}

/** The node carrying a label, wherever the component put it. */
function buttonNamed(node: UiNode, label: string): UiNode {
  if (node.properties.get('label') === label) {
    return node;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = findLabelled(child, label);
    if (found !== null) {
      return found;
    }
  }
  throw new Error(`No node labelled ${label}.`);
}

function findLabelled(node: UiNode, label: string): UiNode | null {
  if (node.properties.get('label') === label) {
    return node;
  }
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    const found = findLabelled(child, label);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

describe('reload and focus', () => {
  it('puts the caret back in the field the person was in', () => {
    const mounted = mountRuntime(createComponent(FormScreen));
    mounted.frame();
    const focus = mounted.runtime.services.get(FocusService);
    focus.focus(buttonNamed(mounted.runtime.debugRoot(), 'Name'));
    expect(focusedLabel(mounted.runtime)).toBe('Name');

    mounted.runtime.reload(createComponent(ReplacedFormScreen));
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('Name');
  });

  it('does not let a replaced autoFocus take the caret from where it was', () => {
    const mounted = mountRuntime(createComponent(DialogScreen));
    mounted.frame();
    const focus = mounted.runtime.services.get(FocusService);
    // The autofocus fired on the first frame; the person then moved.
    expect(focusedLabel(mounted.runtime)).toBe('Email');
    focus.focus(buttonNamed(mounted.runtime.debugRoot(), 'Name'));

    mounted.runtime.reload(createComponent(ReplacedDialogScreen));
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('Name');
  });

  it('leaves the caret nowhere when it was nowhere, rather than autofocusing again', () => {
    const mounted = mountRuntime(createComponent(DialogScreen));
    mounted.frame();
    mounted.runtime.services.get(FocusService).blur();
    expect(focusedLabel(mounted.runtime)).toBeUndefined();

    mounted.runtime.reload(createComponent(ReplacedDialogScreen));
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBeUndefined();
  });
});
