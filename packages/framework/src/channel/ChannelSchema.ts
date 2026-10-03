/**
 * A channel described at run time: what its view holds and what its
 * commands take, as JSON Schema.
 *
 * A token's types are erased by the compiler, so a running application
 * cannot ask a channel what it accepts. That is no loss to a component,
 * which was typechecked against the token, and all of it to anything
 * that meets the application only at run time: an AI agent being
 * handed the channel as tools, a devtools panel, a test that drives an
 * app by its commands. The schema is the contract again, in the one
 * form those can read.
 *
 * `gesso-vite-plugin` writes it from the contract's own types and
 * JSDoc, so an application that uses the plugin describes its channels
 * by having written them. Without the plugin, `describeChannel` takes a
 * hand-written one.
 */
import type { ChannelToken } from './ChannelToken';

/**
 * A JSON Schema (draft 2020-12) object.
 *
 * Deliberately loose: the framework stores and hands back schemas and
 * never interprets one, so a precise type would be a second JSON Schema
 * specification to keep in step with the real one.
 */
export type JsonSchema = { readonly [keyword: string]: unknown };

/** One command, described. */
export interface CommandSchema {
  /** The command's JSDoc summary. */
  readonly description?: string;
  /**
   * The parameter names, in the order the command takes them.
   *
   * A command is called positionally, `move(from, to)`, while a tool
   * call names its arguments, so this is what maps one onto the other.
   */
  readonly parameters: readonly string[];
  /** The last parameter is a rest parameter, and its array is spread into the call. */
  readonly rest?: true;
  /** An object schema, one property per parameter, keyed by parameter name. */
  readonly input: JsonSchema;
  /** `@destructive`: what it does cannot be undone. */
  readonly destructive?: true;
  /** `@idempotent`: sending it twice changes nothing the first did not. */
  readonly idempotent?: true;
  /** `@confirm`: a person should approve it before anything else sends it. */
  readonly confirm?: true;
  /** `@hidden`: for the application's own components, not for an agent. */
  readonly hidden?: true;
}

/** A channel, described. */
export interface ChannelSchema {
  /** The token's JSDoc summary. */
  readonly description?: string;
  /** An object schema, one property per view key. */
  readonly view: JsonSchema;
  readonly commands: { readonly [name: string]: CommandSchema };
}

/**
 * The schemas, beside the tokens rather than on them.
 *
 * A token is a plain object both threads import and nothing should
 * grow on, and its interface is a public type that a schema field would
 * widen for every application, described or not. Keyed weakly, so a
 * token the application drops takes its schema with it.
 */
const schemas = new WeakMap<object, ChannelSchema>();

/**
 * Attaches a schema to a token.
 *
 * `gesso-vite-plugin` calls this at the bottom of each contract module
 * it reads, so it runs once, when the module is first imported. Call it
 * yourself to describe a channel the plugin does not see. A second call
 * for the same token replaces the first, which is what a hot-replaced
 * contract module does.
 */
export function describeChannel(token: ChannelToken<object, object>, schema: ChannelSchema): void {
  schemas.set(token, schema);
}

/** The schema attached to a token, or undefined when nothing described it. */
export function channelSchema(token: ChannelToken<object, object>): ChannelSchema | undefined {
  return schemas.get(token);
}
