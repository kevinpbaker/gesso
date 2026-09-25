import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../graph/UiNodeType';
import type { UiNode } from '../graph/UiNode';
import { isNodeFocusable, isNodeTabStop } from './UiInteraction';
import { InputTestHarness } from './UiInputTestUtils';
import type { UiFocusManager } from './UiFocusManager';

/**
 * `tabStop`, and the dialog that could not be dismissed.
 *
 * `focusable` answers "may this node hold focus", and that turned out
 * to be the wrong question for a container. `UiFocusManager.settleScope`
 * moved focus into the innermost scope and blurred when the scope held
 * nothing focusable — so a `Dialog` whose content is a sentence and a
 * paragraph handed the keyboard to nothing, and Escape, the one thing
 * a modal must always answer, had nowhere to be delivered. Found by
 * pressing Escape on a dialog with no controls in it.
 *
 * The obvious fix, making the dialog body focusable like `Menu`'s, puts
 * the container into the Tab cycle: every dialog then gains a stop on a
 * box that announces nothing and does nothing. Both halves are needed,
 * and `tabStop: false` is the second: focusable, reachable by a press
 * and by `focus()`, skipped by the cycle. It is `tabindex="-1"`, which
 * the DOM has had all along.
 */
function page(): {
  h: InputTestHarness;
  before: UiNode;
  container: UiNode;
  inside: UiNode;
  after: UiNode;
  focusManager: UiFocusManager;
} {
  const h = new InputTestHarness();
  const before = h.node('before', UiNodeType.Button, { width: 200, height: 40 });
  const container = h.node('container', UiNodeType.Box, { width: 200, height: 40, focusable: true, tabStop: false });
  const inside = h.node('inside', UiNodeType.Button, { width: 200, height: 40 });
  const after = h.node('after', UiNodeType.Button, { width: 200, height: 40 });
  h.add(container, inside);
  h.add(h.root, before, container, after);
  h.layoutTree();
  return { h, before, container, inside, after, focusManager: h.createFocusManager() };
}

describe('tabStop', () => {
  it('says nothing about whether a node may hold focus', () => {
    const { container } = page();

    expect(isNodeFocusable(container)).toBe(true);
    expect(isNodeTabStop(container)).toBe(false);
  });

  it('is not read on a node that is not focusable, because there is no order to be out of', () => {
    const h = new InputTestHarness();
    const plain = h.node('plain', UiNodeType.Box, { width: 10, height: 10, tabStop: false });
    h.add(h.root, plain);
    h.layoutTree();

    expect(isNodeFocusable(plain)).toBe(false);
    expect(isNodeTabStop(plain)).toBe(false);
  });

  it('leaves a focusable node in the cycle when it is not set', () => {
    const h = new InputTestHarness();
    const box = h.node('box', UiNodeType.Box, { width: 10, height: 10, focusable: true });
    h.add(h.root, box);
    h.layoutTree();

    expect(isNodeTabStop(box)).toBe(true);
  });

  it('is skipped by Tab', () => {
    const { before, inside, after, focusManager } = page();
    focusManager.focus(before);

    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(inside);
    focusManager.focusNext();
    expect(focusManager.focusedNode).toBe(after);
  });

  it('is skipped by Shift+Tab', () => {
    const { before, inside, after, focusManager } = page();
    focusManager.focus(after);

    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(inside);
    focusManager.focusPrevious();
    expect(focusManager.focusedNode).toBe(before);
  });

  it('is still reachable by focus()', () => {
    const { container, focusManager } = page();

    expect(focusManager.focus(container)).toBe(true);
    expect(focusManager.focusedNode).toBe(container);
  });

  it('is still reachable by a press, which is how a container gets its arrows back', () => {
    const { container, h, focusManager } = page();
    const text = h.node('label', UiNodeType.Text, { width: 10, height: 10 });
    h.add(container, text);
    h.layoutTree();

    focusManager.focusOnPress(text);

    expect(focusManager.focusedNode).toBe(container);
  });
});

describe('a scope with nothing to focus', () => {
  /** A trap whose body holds only text, which is the dialog that broke. */
  function bare(): { body: UiNode; opener: UiNode; focusManager: UiFocusManager } {
    const h = new InputTestHarness();
    const opener = h.node('opener', UiNodeType.Button, { width: 200, height: 40 });
    const body = h.node('body', UiNodeType.Box, { width: 200, height: 80, focusable: true, tabStop: false });
    const prose = h.node('prose', UiNodeType.Text, { width: 200, height: 40 });
    h.add(body, prose);
    h.add(h.root, opener, body);
    h.layoutTree();
    return { body, opener, focusManager: h.createFocusManager() };
  }

  it('gives the keyboard to the scope root rather than to nothing', () => {
    const { body, opener, focusManager } = bare();
    focusManager.focus(opener);

    focusManager.pushScope(body);

    expect(focusManager.focusedNode).toBe(body);
  });

  it('does not make the root a stop it has landed on, so Tab has nowhere else to go', () => {
    const { body, focusManager } = bare();
    focusManager.pushScope(body);

    focusManager.focusNext();

    // Nothing inside is a stop and the root is not one either, so the
    // cycle is empty and focus stays where the fallback put it. What
    // matters is that it is still *somewhere*: Escape has a listener.
    expect(focusManager.focusedNode).toBe(body);
  });

  it('prefers a real stop inside the scope over the root', () => {
    const h = new InputTestHarness();
    const body = h.node('body', UiNodeType.Box, { width: 200, height: 80, focusable: true, tabStop: false });
    const close = h.node('close', UiNodeType.Button, { width: 200, height: 40 });
    h.add(body, close);
    h.add(h.root, body);
    h.layoutTree();
    const focusManager = h.createFocusManager();

    focusManager.pushScope(body);

    expect(focusManager.focusedNode).toBe(close);
  });

  it('still blurs when the root cannot hold focus either', () => {
    // A scope that genuinely has nothing to focus is better admitted
    // than faked, so the old behaviour survives where it was right.
    const h = new InputTestHarness();
    const opener = h.node('opener', UiNodeType.Button, { width: 200, height: 40 });
    const body = h.node('body', UiNodeType.Box, { width: 200, height: 80 });
    const prose = h.node('prose', UiNodeType.Text, { width: 200, height: 40 });
    h.add(body, prose);
    h.add(h.root, opener, body);
    h.layoutTree();
    const focusManager = h.createFocusManager();
    focusManager.focus(opener);

    focusManager.pushScope(body);

    expect(focusManager.focusedNode).toBeNull();
  });

  it('hands focus back to the opener when the scope ends', () => {
    const { body, opener, focusManager } = bare();
    focusManager.focus(opener);
    focusManager.pushScope(body);

    focusManager.popScope();

    expect(focusManager.focusedNode).toBe(opener);
  });
});
