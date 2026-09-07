import type { UiNode, UiRole, UiSemanticState, UiSemanticsRecord } from '@gesso/core';
import { textContentOf } from '@gesso/core';

import type { RenderedBase } from './renderTest';

/** A string matches exactly after whitespace collapsing; a RegExp is tested. */
export type TextMatch = string | RegExp;

export interface RoleQueryOptions {
  /**
   * The accessible name, as a screen reader would announce it: the
   * node's `label` if it has one, else the text it draws.
   */
  name?: TextMatch;
  /** Every one of these must be on the record. */
  states?: readonly UiSemanticState[];
  /** Match only enabled (`false`) or only disabled (`true`) nodes. */
  disabled?: boolean;
}

/**
 * The queries a render answers.
 *
 * Three variants of each, and the difference between them is what
 * happens when the count is not one:
 *
 *  - `getBy…` returns the single match and throws otherwise. This is
 *    the one to reach for; the throw carries the tree.
 *  - `queryBy…` returns `null` for no match and still throws for many,
 *    because "there is more than one" is never the question `queryBy`
 *    is asked.
 *  - `getAllBy…` returns every match, in document order, and throws
 *    only when there are none.
 *
 * `findBy…` is `getBy…` with frames: it drives the clock until the
 * match appears, for anything that arrives after the frame it was
 * asked for — a channel patch, a resolved image, a component that
 * awaited something.
 */
export interface Queries {
  getByRole(role: UiRole, options?: RoleQueryOptions): UiNode;
  queryByRole(role: UiRole, options?: RoleQueryOptions): UiNode | null;
  getAllByRole(role: UiRole, options?: RoleQueryOptions): UiNode[];
  findByRole(role: UiRole, options?: RoleQueryOptions & { maxFrames?: number }): Promise<UiNode>;

  /** By accessible name, whatever the role. */
  getByLabel(name: TextMatch): UiNode;
  queryByLabel(name: TextMatch): UiNode | null;
  getAllByLabel(name: TextMatch): UiNode[];
  findByLabel(name: TextMatch, options?: { maxFrames?: number }): Promise<UiNode>;

  /**
   * By the text a node actually draws.
   *
   * Distinct from `getByLabel`, and the difference matters: the `Text`
   * inside a `Button` is *claimed* as the button's name and so has no
   * semantics record of its own. `getByLabel('Save')` finds the button;
   * `getByText('Save')` finds the text node inside it.
   */
  getByText(text: TextMatch): UiNode;
  queryByText(text: TextMatch): UiNode | null;
  getAllByText(text: TextMatch): UiNode[];
  findByText(text: TextMatch, options?: { maxFrames?: number }): Promise<UiNode>;

  /** Every node under the layout root, in document order. */
  allNodes(): UiNode[];
  /** The text every node under `node` draws, in document order. */
  textOf(node?: UiNode): string[];
}

/** Collapses runs of whitespace and trims, the way a reader would read it. */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function matches(actual: string | undefined, expected: TextMatch): boolean {
  if (actual === undefined) {
    return false;
  }
  const text = normalize(actual);
  return typeof expected === 'string' ? text === normalize(expected) : expected.test(text);
}

function describeMatch(expected: TextMatch): string {
  return typeof expected === 'string' ? JSON.stringify(expected) : String(expected);
}

export function nodesUnder(root: UiNode): UiNode[] {
  const out: UiNode[] = [];
  const visit = (node: UiNode): void => {
    out.push(node);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(root);
  return out;
}

/**
 * The text a node draws, if it draws any.
 *
 * A paragraph given runs holds its text in them rather than in a
 * `text` property, and `getByText` has to find it either way, so this
 * asks the same question the layout engine, paint, selection, find and
 * the semantics mirror all ask.
 */
export function textProperty(node: UiNode): string | undefined {
  const text = textContentOf(node);
  return text.length > 0 ? text : undefined;
}

function recordMatches(record: UiSemanticsRecord, role: UiRole, options: RoleQueryOptions): boolean {
  if (record.role !== role) {
    return false;
  }
  if (options.name !== undefined && !matches(record.label, options.name)) {
    return false;
  }
  if (options.disabled !== undefined && (record.disabled === true) !== options.disabled) {
    return false;
  }
  if (options.states !== undefined) {
    const states = record.states ?? [];
    if (!options.states.every(state => states.includes(state))) {
      return false;
    }
  }
  return true;
}

function describeRoleQuery(role: UiRole, options: RoleQueryOptions): string {
  const parts = [`role ${JSON.stringify(role)}`];
  if (options.name !== undefined) {
    parts.push(`name ${describeMatch(options.name)}`);
  }
  if (options.states !== undefined) {
    parts.push(`states [${options.states.join(', ')}]`);
  }
  if (options.disabled !== undefined) {
    parts.push(options.disabled ? 'disabled' : 'enabled');
  }
  return parts.join(', ');
}

/**
 * What is actually there, so a failed query does not send the reader
 * to a debugger.
 *
 * A missed query is nearly always a name that differs by a word or a
 * role the component does not emit, and both are answered by printing
 * the tree the assistive technology can see next to the tree that was
 * drawn.
 */
function failure(base: RenderedBase, wanted: string, found: number): Error {
  const roles = [...base.semanticsTree().values()]
    .map(
      record =>
        `  ${record.role ?? '(no role)'}${record.label === undefined ? '' : ` · ${JSON.stringify(record.label)}`}`
    )
    .join('\n');
  const count = found === 0 ? 'Nothing matches' : `${found} nodes match`;
  return new Error(
    `${count} ${wanted}.\n\n` +
      `The semantics tree has:\n${roles.length > 0 ? roles : '  (nothing)'}\n\n` +
      `The node tree is:\n${base.debug()}`
  );
}

/**
 * Runs frames until the query answers, then answers.
 *
 * The cap is frames rather than milliseconds because the clock here is
 * manual: there is no wall clock to time out against, and "a hundred
 * frames and it still is not there" is both reproducible and the more
 * useful thing to report.
 */
async function findWith(base: RenderedBase, query: () => UiNode[], wanted: string, maxFrames: number): Promise<UiNode> {
  for (let index = 0; index <= maxFrames; index++) {
    const found = query();
    if (found.length === 1) {
      return found[0];
    }
    if (found.length > 1) {
      throw failure(base, wanted, found.length);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    base.frame();
  }
  throw failure(base, `${wanted} after ${maxFrames} frames`, 0);
}

const DEFAULT_MAX_FRAMES = 100;

export function createQueries(base: RenderedBase): Queries {
  const root = (): UiNode => base.runtime.layoutRoot();
  const allNodes = (): UiNode[] => nodesUnder(root());

  /**
   * Every node by id, so a semantics record can be turned back into the
   * node it describes. Records are keyed by node id and the tree is
   * built by a document-order walk, so iterating the semantics map and
   * looking each record up here yields matches in tree order.
   */
  const nodeById = (): Map<string, UiNode> => new Map(allNodes().map(node => [node.id, node]));

  const byRole = (role: UiRole, options: RoleQueryOptions): UiNode[] => {
    const nodes = nodeById();
    const found: UiNode[] = [];
    for (const record of base.semanticsTree().values()) {
      if (!recordMatches(record, role, options)) {
        continue;
      }
      const node = nodes.get(record.id);
      if (node !== undefined) {
        found.push(node);
      }
    }
    return found;
  };

  const byLabel = (name: TextMatch): UiNode[] => {
    const nodes = nodeById();
    const found: UiNode[] = [];
    for (const record of base.semanticsTree().values()) {
      if (!matches(record.label, name)) {
        continue;
      }
      const node = nodes.get(record.id);
      if (node !== undefined) {
        found.push(node);
      }
    }
    return found;
  };

  const byText = (text: TextMatch): UiNode[] => allNodes().filter(node => matches(textProperty(node), text));

  /** The three variants, built once from one finder. */
  function variants<A extends unknown[]>(find: (...args: A) => UiNode[], describe: (...args: A) => string) {
    const getAll = (...args: A): UiNode[] => {
      const found = find(...args);
      if (found.length === 0) {
        throw failure(base, describe(...args), 0);
      }
      return found;
    };
    const get = (...args: A): UiNode => {
      const found = find(...args);
      if (found.length !== 1) {
        throw failure(base, describe(...args), found.length);
      }
      return found[0];
    };
    const query = (...args: A): UiNode | null => {
      const found = find(...args);
      if (found.length > 1) {
        throw failure(base, describe(...args), found.length);
      }
      return found[0] ?? null;
    };
    return { get, query, getAll };
  }

  const role = variants(
    (r: UiRole, options: RoleQueryOptions = {}) => byRole(r, options),
    (r: UiRole, options: RoleQueryOptions = {}) => describeRoleQuery(r, options)
  );
  const label = variants(
    (name: TextMatch) => byLabel(name),
    (name: TextMatch) => `the accessible name ${describeMatch(name)}`
  );
  const text = variants(
    (value: TextMatch) => byText(value),
    (value: TextMatch) => `the text ${describeMatch(value)}`
  );

  return {
    getByRole: role.get,
    queryByRole: role.query,
    getAllByRole: role.getAll,
    findByRole: (r, options = {}) => {
      const { maxFrames = DEFAULT_MAX_FRAMES, ...rest } = options;
      return findWith(base, () => byRole(r, rest), describeRoleQuery(r, rest), maxFrames);
    },

    getByLabel: label.get,
    queryByLabel: label.query,
    getAllByLabel: label.getAll,
    findByLabel: (name, options = {}) =>
      findWith(
        base,
        () => byLabel(name),
        `the accessible name ${describeMatch(name)}`,
        options.maxFrames ?? DEFAULT_MAX_FRAMES
      ),

    getByText: text.get,
    queryByText: text.query,
    getAllByText: text.getAll,
    findByText: (value, options = {}) =>
      findWith(base, () => byText(value), `the text ${describeMatch(value)}`, options.maxFrames ?? DEFAULT_MAX_FRAMES),

    allNodes,
    textOf: node =>
      nodesUnder(node ?? root())
        .map(textProperty)
        .filter((value): value is string => value !== undefined)
  };
}
