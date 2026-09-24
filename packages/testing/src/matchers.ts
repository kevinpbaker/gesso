import { expect } from 'vitest';

import type { LayoutBox, UiNode, UiRole, UiSemanticState } from 'gesso-core';

import { textProperty } from './queries';
import { renderedFor } from './registry';

/**
 * The matchers, and the reason the package has any.
 *
 * `expect(ui.getLayout(node)).toEqual({ x: 8, y: 8, width: 64, height: 32 })`
 * already works, so a matcher that only compared numbers would be
 * decoration. What these add is the failure message: a `toHaveBox` that
 * misses prints the node's layout explanation — the constraints it was
 * given, the rule that fixed each axis, and the ancestor it is laid out
 * from — which is L8's `engine.explain` arriving exactly where someone
 * is looking at a wrong number and asking why.
 *
 * That is the F7 exit criterion in one place: *fix a layout bug using
 * only the inspector and the testing library*. The inspector answers it
 * on a canvas; this answers it in a terminal.
 *
 * Importing this module registers them:
 *
 * ```ts
 * import 'gesso-testing/matchers';
 * ```
 *
 * A separate entry rather than the root barrel, because `expect.extend`
 * is a side effect on a global and importing `renderTest` should not
 * perform one.
 */

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/** The explanation for a node, or a note saying why there is none. */
function explanationOf(node: UiNode): string {
  const rendered = renderedFor(node);
  if (rendered === null) {
    return 'This node was not mounted by renderTest(), so there is no layout engine to ask why.';
  }
  return rendered.explainText(node);
}

function boxOf(node: UiNode): LayoutBox | null {
  return renderedFor(node)?.getLayout(node) ?? null;
}

function visibleBoxOf(node: UiNode): LayoutBox | null {
  return renderedFor(node)?.getVisibleBox(node) ?? null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface ExpectedSemantics {
  role?: UiRole;
  /** The accessible name. */
  name?: string;
  states?: readonly UiSemanticState[];
  disabled?: boolean;
  value?: number;
}

export const matchers = {
  /**
   * The node's border box, in layout-root coordinates.
   *
   * Every field is optional, so `toHaveBox({ width: 64 })` asserts the
   * width and says nothing about the rest — which is what a layout test
   * usually means, and stops a test breaking because a sibling above it
   * grew by a pixel.
   */
  toHaveBox(received: UiNode, expected: Partial<LayoutBox>): MatcherResult {
    const box = boxOf(received);
    if (box === null) {
      return {
        pass: false,
        message: () => `Expected a node mounted by renderTest(); '${received.id}' was not.`
      };
    }
    const wrong = (Object.keys(expected) as (keyof LayoutBox)[]).filter(
      key => round(box[key]) !== round(expected[key] as number)
    );
    return {
      pass: wrong.length === 0,
      message: () =>
        wrong.length === 0
          ? `Expected '${received.id}' not to have box ${JSON.stringify(expected)}.`
          : `Expected '${received.id}' to have ${wrong.map(key => `${key} ${expected[key]}`).join(', ')}, ` +
            `but its box is ${JSON.stringify({
              x: round(box.x),
              y: round(box.y),
              width: round(box.width),
              height: round(box.height)
            })}.\n\nWhy:\n${explanationOf(received)}`
    };
  },

  /**
   * Where the node is *seen*, with scroll offsets and sticky shifts
   * applied.
   *
   * The matcher to reach for when the claim is about scrolling. A
   * sticky header's laid-out box is at the top of its content whether
   * or not sticky works, so `toHaveBox` asserts nothing about it after
   * a scroll; this is the one that does.
   */
  toHaveVisibleBox(received: UiNode, expected: Partial<LayoutBox>): MatcherResult {
    const box = visibleBoxOf(received);
    if (box === null) {
      return {
        pass: false,
        message: () => `Expected a node mounted by renderTest(); '${received.id}' was not.`
      };
    }
    const wrong = (Object.keys(expected) as (keyof LayoutBox)[]).filter(
      key => round(box[key]) !== round(expected[key] as number)
    );
    return {
      pass: wrong.length === 0,
      message: () =>
        wrong.length === 0
          ? `Expected '${received.id}' not to be seen at ${JSON.stringify(expected)}.`
          : `Expected '${received.id}' to be seen at ${wrong.map(key => `${key} ${expected[key]}`).join(', ')}, ` +
            `but it is seen at ${JSON.stringify({
              x: round(box.x),
              y: round(box.y),
              width: round(box.width),
              height: round(box.height)
            })}.\n\nWhy:\n${explanationOf(received)}`
    };
  },

  /** The text the node itself draws — not its descendants, and not its label. */
  toHaveText(received: UiNode, expected: string): MatcherResult {
    const actual = textProperty(received);
    return {
      pass: actual === expected,
      message: () =>
        actual === expected
          ? `Expected '${received.id}' not to have the text ${JSON.stringify(expected)}.`
          : `Expected '${received.id}' to have the text ${JSON.stringify(expected)}, but it has ` +
            `${actual === undefined ? 'none' : JSON.stringify(actual)}.`
    };
  },

  /**
   * What an assistive technology would announce for this node.
   *
   * Compares only the fields given, for the same reason `toHaveBox`
   * does: a component that gains a `posInSet` should not break every
   * test that ever asserted its role.
   */
  toHaveSemantics(received: UiNode, expected: ExpectedSemantics): MatcherResult {
    const rendered = renderedFor(received);
    if (rendered === null) {
      return {
        pass: false,
        message: () => `Expected a node mounted by renderTest(); '${received.id}' was not.`
      };
    }
    const record = rendered.querySemantics(received);
    if (record === null) {
      return {
        pass: false,
        message: () =>
          `Expected '${received.id}' to be in the semantics tree, but it is not — ` +
          `nothing gives it a role or a label, so no assistive technology can see it.\n\n${rendered.debug()}`
      };
    }
    const actual: ExpectedSemantics = {
      role: record.role,
      name: record.label,
      states: record.states ?? [],
      disabled: record.disabled === true,
      value: record.valueNow
    };
    const wrong = (Object.keys(expected) as (keyof ExpectedSemantics)[]).filter(key => {
      if (key === 'states') {
        const want = [...(expected.states ?? [])].sort();
        const have = [...(actual.states ?? [])].sort();
        return want.length !== have.length || want.some((state, index) => state !== have[index]);
      }
      return actual[key] !== expected[key];
    });
    return {
      pass: wrong.length === 0,
      message: () =>
        wrong.length === 0
          ? `Expected '${received.id}' not to have semantics ${JSON.stringify(expected)}.`
          : `Expected '${received.id}' to have ${wrong
              .map(key => `${key} ${JSON.stringify(expected[key])}`)
              .join(', ')}, but a screen reader sees ${JSON.stringify(actual)}.`
    };
  },

  /** Whether the runtime's focus manager currently has this node. */
  toHaveFocus(received: UiNode): MatcherResult {
    const rendered = renderedFor(received);
    if (rendered === null) {
      return {
        pass: false,
        message: () => `Expected a node mounted by renderTest(); '${received.id}' was not.`
      };
    }
    const focused = rendered.runtime.input.focus.focusedNode;
    return {
      pass: focused === received,
      message: () =>
        focused === received
          ? `Expected '${received.id}' not to have focus.`
          : `Expected '${received.id}' to have focus, but ${
              focused === null ? 'nothing does' : `'${focused.id}' does`
            }.`
    };
  }
};

expect.extend(matchers);

interface GessoMatchers<R = unknown> {
  toHaveBox: (expected: Partial<LayoutBox>) => R;
  toHaveVisibleBox: (expected: Partial<LayoutBox>) => R;
  toHaveText: (expected: string) => R;
  toHaveSemantics: (expected: ExpectedSemantics) => R;
  toHaveFocus: () => R;
}

/**
 * `T` here is vitest's own default for the interface it is merging
 * into, and it has to be spelled the same way or the merge is an
 * error: `All declarations of 'Matchers' must have identical type
 * parameters.`
 */
declare module 'vitest' {
  // oxlint-disable-next-line no-explicit-any
  interface Matchers<T = any> extends GessoMatchers<T> {}
}
