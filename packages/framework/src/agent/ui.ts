import type { UiKeyModifiers, UiSemanticsAction, UiSemanticsMap, UiSemanticsRecord } from 'gesso-core';

import type { JsonSchema } from '../channel/ChannelSchema';
import type { AgentSurface, AgentTool, AgentToolResult } from './AgentSurface';

/**
 * The screen, as tools an agent can use.
 *
 * Channels are the application's own vocabulary, and the right way in
 * for anything they cover. Not everything is covered: a dialog's
 * buttons, a tab, a field the person is halfway through filling. For
 * those an agent has to do what a person does, and a canvas gives it
 * nothing to do that with: no DOM to query, no element to click.
 *
 * The semantics tree is the answer a screen reader already gets. Every
 * control has a role and an accessible name, a state, a value, and an
 * id, so an agent can read the screen as an outline and act on a
 * control by naming it. Acting goes through `applySemanticsAction`,
 * the path the accessibility mirror uses, which turns a press into the
 * same click a pointer makes and a value into the same edit a keyboard
 * makes: an agent can do exactly what a person could, no more, and an
 * open focus trap holds it as it holds Tab.
 *
 *   ui_snapshot   the screen as an outline, each control with a ref
 *   ui_press      press a control, by ref or by role and name
 *   ui_type       replace a field's text
 *   ui_focus      move focus to a control
 *   ui_key        press a key where focus is: Enter, Escape, Tab, ArrowDown
 *
 * Each action answers with the outline as it is afterwards.
 */

/** What the tools need of the running application. */
export interface UiHost {
  semanticsTree(): UiSemanticsMap;
  focusedNodeId(): string | null;
  applySemanticsAction(action: UiSemanticsAction): void;
  key(key: string, modifiers: UiKeyModifiers): void;
  /**
   * Runs a pending frame now. A tab in the background is sent no
   * frames, and without one an action's effect never reaches the tree
   * this reads back.
   */
  flush(): void;
}

export interface UiSurfaceOptions {
  /** How long the screen must hold still after an action before it is read back (default 50 ms). */
  quietMs?: number;
  /** The longest an action waits for that (default 1000 ms). */
  settleMs?: number;
}

const TARGET: Record<string, JsonSchema> = {
  ref: { type: 'string', description: 'The ref ui_snapshot gave the control, such as "e4".' },
  role: { type: 'string', description: 'The control\'s role, such as "button" or "textbox".' },
  name: { type: 'string', description: "The control's accessible name, as ui_snapshot shows it in quotes." }
};

const TOOLS: readonly AgentTool[] = [
  {
    name: 'ui_snapshot',
    title: 'Read the screen',
    description:
      'The screen as an outline of what a screen reader would announce: each control with its role, name, state, ' +
      'value and a ref to act on it by. Read it before acting, and again whenever an action did not do what you ' +
      'expected. Prefer a channel tool when one covers what you want; these act on the interface.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'ui_press',
    title: 'Press a control',
    description:
      'Presses a button, link, checkbox, tab or any other control, as a click would. Name it by ref, or by role and ' +
      'name. Returns the screen afterwards.',
    inputSchema: { type: 'object', properties: TARGET, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'ui_type',
    title: 'Fill a field',
    description:
      "Replaces a text field's whole text, as if the person had selected it all and typed. Name the field by ref, or " +
      'by role and name. Returns the screen afterwards; press Enter with ui_key to submit.',
    inputSchema: {
      type: 'object',
      properties: { ...TARGET, text: { type: 'string', description: 'The text the field should hold.' } },
      required: ['text'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  {
    name: 'ui_focus',
    title: 'Focus a control',
    description: 'Moves keyboard focus to a control, by ref or by role and name. Returns the screen afterwards.',
    inputSchema: { type: 'object', properties: TARGET, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'ui_key',
    title: 'Press a key',
    description:
      'Presses a key where focus is, as the keyboard would: Enter, Escape, Tab, ArrowDown, a letter. Modifiers are ' +
      'optional. Returns the screen afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'A KeyboardEvent key name, such as "Enter", "Escape" or "a".' },
        shift: { type: 'boolean' },
        ctrl: { type: 'boolean' },
        alt: { type: 'boolean' },
        meta: { type: 'boolean' }
      },
      required: ['key'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  }
];

/**
 * Short names for record ids.
 *
 * A record's id is its path through the tree, `root:0:0:component:1:0:1`,
 * which is exact and long, and an outline repeats one on every line an
 * agent reads. A ref is `e` and a number, given the first time a record
 * is seen and kept for as long as the surface lives, so the ref an agent
 * read in one snapshot still names the same control in the next.
 */
export class UiRefs {
  private readonly byId = new Map<string, string>();
  private readonly byRef = new Map<string, string>();

  refOf(id: string): string {
    let ref = this.byId.get(id);
    if (ref === undefined) {
      ref = `e${this.byId.size + 1}`;
      this.byId.set(id, ref);
      this.byRef.set(ref, id);
    }
    return ref;
  }

  /** The record id a ref names, or the input itself when it is not a ref this surface gave. */
  idOf(ref: string): string {
    return this.byRef.get(ref) ?? ref;
  }
}

/**
 * The tools, over a host. `host` returns undefined until the
 * application has started, and a tool called before then says so.
 */
export function uiSurface(host: () => UiHost | undefined, options: UiSurfaceOptions = {}): AgentSurface {
  const quietMs = options.quietMs ?? 50;
  const settleMs = options.settleMs ?? 1000;
  const refs = new UiRefs();

  /** Waits until two readings of the screen agree, then returns the last. */
  const settled = async (ui: UiHost): Promise<string> => {
    const start = Date.now();
    let previous = '';
    for (;;) {
      ui.flush();
      const current = outline(ui.semanticsTree(), ui.focusedNodeId(), refs);
      if (current === previous || Date.now() - start >= settleMs) {
        return current;
      }
      previous = current;
      await new Promise(resolve => setTimeout(resolve, quietMs));
    }
  };

  const act = async (
    args: Readonly<Record<string, unknown>>,
    perform: (ui: UiHost, record: UiSemanticsRecord) => string | null
  ): Promise<AgentToolResult> => {
    const ui = host();
    if (ui === undefined) {
      return failure('The application has not started yet.');
    }
    ui.flush();
    const found = resolveTarget(ui.semanticsTree(), args, refs);
    if (typeof found === 'string') {
      return failure(found);
    }
    if (found.disabled === true) {
      return failure(`${describe(found)} is disabled.`);
    }
    const problem = perform(ui, found);
    if (problem !== null) {
      return failure(problem);
    }
    return success(await settled(ui));
  };

  return {
    tools: () => TOOLS,
    call: async (name, args = {}) => {
      switch (name) {
        case 'ui_snapshot': {
          const ui = host();
          return ui === undefined ? failure('The application has not started yet.') : success(await settled(ui));
        }
        case 'ui_press':
          return act(args, (ui, record) => (ui.applySemanticsAction({ id: record.id, action: 'click' }), null));
        case 'ui_focus':
          return act(args, (ui, record) => (ui.applySemanticsAction({ id: record.id, action: 'focus' }), null));
        case 'ui_type':
          if (typeof args.text !== 'string') {
            return failure('ui_type needs text: the text the field should hold.');
          }
          return act(args, (ui, record) => {
            if (record.states?.includes('readonly')) {
              return `${describe(record)} is read-only.`;
            }
            ui.applySemanticsAction({ id: record.id, action: 'setValue', value: args.text as string });
            return null;
          });
        case 'ui_key': {
          const ui = host();
          if (ui === undefined) {
            return failure('The application has not started yet.');
          }
          if (typeof args.key !== 'string' || args.key === '') {
            return failure('ui_key needs key: a KeyboardEvent key name, such as "Enter".');
          }
          ui.key(args.key, {
            shift: args.shift === true,
            ctrl: args.ctrl === true,
            alt: args.alt === true,
            meta: args.meta === true
          });
          return success(await settled(ui));
        }
        default:
          return failure(`There is no tool called ${name}.`);
      }
    },
    resources: () => [],
    read: () => undefined,
    dispose: () => {}
  };
}

/**
 * The tree as an indented outline, one control per line:
 *
 *   - button "Add one" [e3]
 *   - textbox "Title" value="Groceries" [e4] (focused)
 *
 * Text, because an agent reads it, and an outline is a third the size
 * of the same tree as JSON. A record with neither a role nor a name is
 * structure, and its children are lifted to its depth.
 */
export function outline(tree: UiSemanticsMap, focused: string | null, refs: UiRefs = new UiRefs()): string {
  const depths = new Map<string, number>();
  const lines: string[] = [];
  for (const record of tree.values()) {
    const parentDepth = record.parent === null ? -1 : (depths.get(record.parent) ?? -1);
    const shown = record.role !== undefined || (record.label !== undefined && record.label !== '');
    const depth = shown ? parentDepth + 1 : parentDepth;
    depths.set(record.id, depth);
    if (!shown) {
      continue;
    }
    const parts = [`${'  '.repeat(depth)}- ${describe(record)}`];
    if (record.states !== undefined && record.states.length > 0) {
      parts.push(`[${record.states.join(', ')}]`);
    }
    const value = valueOf(record);
    if (value !== null) {
      parts.push(`value=${JSON.stringify(value)}`);
    }
    if (record.disabled === true) {
      parts.push('(disabled)');
    }
    parts.push(`[${refs.refOf(record.id)}]`);
    if (record.id === focused) {
      parts.push('(focused)');
    }
    lines.push(parts.join(' '));
  }
  return lines.length === 0 ? '(the screen announces nothing)' : lines.join('\n');
}

function describe(record: UiSemanticsRecord): string {
  const name = record.label === undefined || record.label === '' ? '' : ` ${JSON.stringify(record.label)}`;
  return `${record.role ?? 'text'}${name}`;
}

function valueOf(record: UiSemanticsRecord): string | null {
  if (record.valueText !== undefined && record.valueText !== record.label) {
    return record.valueText;
  }
  if (record.valueNow !== undefined) {
    return String(record.valueNow);
  }
  return null;
}

/**
 * The record an action names: by ref, or by role and name. A name
 * matches exactly before it matches as a part, ignoring case, so
 * "Save" finds the button called Save rather than "Save as". More than
 * one match is an error listing them, because guessing which of two
 * buttons an agent meant is how the wrong one gets pressed.
 */
export function resolveTarget(
  tree: UiSemanticsMap,
  args: Readonly<Record<string, unknown>>,
  refs: UiRefs = new UiRefs()
): UiSemanticsRecord | string {
  const ref = typeof args.ref === 'string' ? args.ref : undefined;
  const role = typeof args.role === 'string' ? args.role : undefined;
  const name = typeof args.name === 'string' ? args.name : undefined;
  if (ref !== undefined) {
    return (
      tree.get(refs.idOf(ref)) ??
      `Nothing on the screen has the ref ${ref} now. Read ui_snapshot again for current refs.`
    );
  }
  if (role === undefined && name === undefined) {
    return 'Say which control: a ref from ui_snapshot, or a role and a name.';
  }
  const candidates = [...tree.values()].filter(record => role === undefined || record.role === role);
  let matches = candidates;
  if (name !== undefined) {
    const wanted = name.toLowerCase();
    const exact = candidates.filter(record => record.label?.toLowerCase() === wanted);
    matches = exact.length > 0 ? exact : candidates.filter(record => record.label?.toLowerCase().includes(wanted));
  }
  const wanted = [role, name === undefined ? undefined : JSON.stringify(name)].filter(Boolean).join(' ');
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 0) {
    const nearby = candidates
      .filter(record => record.role !== undefined)
      .slice(0, 10)
      .map(record => `${describe(record)} [${refs.refOf(record.id)}]`);
    return `Nothing on the screen is ${wanted}.${nearby.length > 0 ? ` Some that are: ${nearby.join('; ')}.` : ''}`;
  }
  return `${matches.length} controls are ${wanted}: ${matches
    .slice(0, 10)
    .map(record => `${describe(record)} [${refs.refOf(record.id)}]`)
    .join('; ')}. Use a ref.`;
}

function success(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: false };
}

function failure(text: string): AgentToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
