import type { ChannelSchemaOut } from './contracts.ts';

/**
 * What in a channel's contract an AI agent will struggle with.
 *
 * Every channel is offered to agents with nothing more written, but what
 * an agent reads about it is the JSDoc, and an application written
 * before agents mattered mostly has none. Run against the issue
 * tracker, 26 of its 42 commands reached an agent as "Sends setQuery to
 * the issues channel.", a required `label` said nothing of what it was
 * for, `priority` was 0 to 4 with nothing saying 1 is Urgent, and
 * `reset`, which puts the whole workspace back to its seed, was offered
 * with no confirm. None of it is an error, so the checker is silent;
 * this says it, while the dev server runs, in the terms of the fix.
 *
 * Three things, each of which made an agent guess or could cost the
 * person their work:
 *
 *   - a command with no description;
 *   - one of those whose name says it may not be undone (`reset`,
 *     `remove`, `delete` …) and that is not marked `@destructive`,
 *     `@confirm` or `@hidden`. A described command is left alone: its
 *     author has thought about it, and a name is a weak sign;
 *   - an input that is one of a few numbers with nothing saying what
 *     each means.
 *
 * At most one message per channel, so a contract is one warning, not a
 * screenful. A channel kept from agents (`@hidden` on the token) and
 * hidden commands are not looked at.
 */

type JsonSchema = Record<string, unknown>;

/** Leading words of a command name that say it may not be undone. */
const FINAL = new Set(['reset', 'remove', 'delete', 'destroy', 'purge', 'wipe', 'erase', 'drop', 'truncate']);

/** The most names listed in one line before "and N more". */
const LISTED = 8;

/**
 * One message for each channel in a module an agent would struggle
 * with, in the order given. `file` is where the module is, as the
 * person would find it.
 */
export function agentReadiness(channels: ReadonlyMap<string, ChannelSchemaOut>, file: string): string[] {
  const messages: string[] = [];
  for (const [exported, schema] of channels) {
    if (schema.internal === true) continue;
    const problems = channelProblems(schema);
    if (problems.length > 0) {
      messages.push(
        [`The channel ${exported} in ${file} is hard for an AI agent to use:`, ...problems.map(p => `  - ${p}`)].join(
          '\n'
        )
      );
    }
  }
  return messages;
}

function channelProblems(schema: ChannelSchemaOut): string[] {
  const offered = Object.entries(schema.commands).filter(([, command]) => command.hidden !== true);
  const undescribed = offered.filter(([, command]) => (command.description ?? '').trim() === '');
  const problems: string[] = [];

  if (undescribed.length > 0) {
    const names = listed(undescribed.map(([command]) => command));
    const [k, n] = [undescribed.length, offered.length];
    const count =
      k === n
        ? n === 1
          ? 'Its one command has no JSDoc'
          : `None of its ${n} commands has JSDoc`
        : `${k} of its ${n} commands ${k === 1 ? 'has' : 'have'} no JSDoc`;
    problems.push(
      `${count}, so an agent reads only ${k === 1 ? 'its name' : 'their names'}: ${names}. ` +
        `Write a sentence on ${k === 1 ? 'it' : 'each'}, for someone who has never seen the code.`
    );
  }

  for (const [command, described] of undescribed) {
    if (!FINAL.has(firstWord(command))) continue;
    if (described.destructive === true || described.confirm === true) continue;
    problems.push(
      `${command} has no JSDoc, and its name says it may not be undone, so agents are offered it with no ` +
        'confirm. Mark it `@destructive @confirm`, or `@hidden` to keep it from agents.'
    );
  }

  const codes = new Map<string, string>();
  for (const [command, described] of offered) {
    for (const [path, values] of numberCodes(described.input, command)) {
      const key = `${path.slice(path.lastIndexOf('.') + 1)}:${values}`;
      if (!codes.has(key)) codes.set(key, `${path} is one of ${values}`);
    }
  }
  for (const code of codes.values()) {
    problems.push(`${code}, with nothing saying what each number means. Say so in a JSDoc on the field.`);
  }

  return problems;
}

/** `removeChild` → `remove`, `reset` → `reset`. */
function firstWord(command: string): string {
  return command.replace(/[A-Z_].*$/, '').toLowerCase();
}

function listed(names: readonly string[]): string {
  return names.length <= LISTED
    ? names.join(', ')
    : `${names.slice(0, LISTED).join(', ')} and ${names.length - LISTED} more`;
}

/**
 * Every place in a command's input that is a choice of numbers with no
 * description, as `[path, "0, 1, 2"]`: `update(request).patch.priority`.
 */
function numberCodes(input: JsonSchema, command: string): [string, string][] {
  const found: [string, string][] = [];
  const defs = (input.$defs ?? {}) as Record<string, JsonSchema>;
  const seen = new Set<string>();
  const walk = (schema: unknown, path: string): void => {
    if (typeof schema !== 'object' || schema === null) return;
    const node = schema as JsonSchema;
    if (typeof node.$ref === 'string') {
      const ref = node.$ref.replace('#/$defs/', '');
      if (seen.has(ref)) return;
      seen.add(ref);
      walk(defs[ref], path);
      seen.delete(ref);
      return;
    }
    if (Array.isArray(node.enum) && node.enum.length > 1 && node.enum.every(value => typeof value === 'number')) {
      if (typeof node.description !== 'string' || node.description.trim() === '') {
        found.push([path, node.enum.join(', ')]);
      }
      return;
    }
    const properties = node.properties as Record<string, unknown> | undefined;
    for (const [key, child] of Object.entries(properties ?? {})) {
      // A described parameter's text is on the property; a description there covers the codes too.
      const described = child as JsonSchema;
      if (typeof described.description === 'string' && described.description.trim() !== '') continue;
      walk(child, path === '' ? key : `${path}.${key}`);
    }
    for (const branch of [...((node.anyOf as unknown[]) ?? []), ...((node.oneOf as unknown[]) ?? [])]) {
      walk(branch, path);
    }
    if (node.items !== undefined) walk(node.items, `${path}[]`);
  };
  const properties = (input.properties ?? {}) as Record<string, unknown>;
  for (const [parameter, schema] of Object.entries(properties)) {
    const described = schema as JsonSchema;
    if (typeof described.description === 'string' && described.description.trim() !== '') continue;
    walk(schema, `${command}(${parameter})`);
  }
  return found;
}
