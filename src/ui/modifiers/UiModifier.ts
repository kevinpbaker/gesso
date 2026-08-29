import type { UiModifierHost } from './UiModifierHost';

/**
 * A kind of behaviour that can be attached to an element.
 *
 * One kind per behaviour, not per use: `hoverable()` produces many
 * `UiModifier` values that all share the one `hoverableKind`. The kind
 * holds the lifecycle; the value holds the arguments.
 */
export interface UiModifierKind<A> {
  /** Identity for reconciliation and for the inspector. */
  readonly key: symbol;
  readonly name: string;
  attach(host: UiModifierHost, args: A): void;
  /**
   * Same kind, same slot, different arguments. Omitting it means a
   * change is a detach followed by an attach.
   */
  update?(host: UiModifierHost, args: A, previous: A): void;
  detach?(host: UiModifierHost): void;
}

/**
 * What an element carries: a kind and the arguments to give it.
 *
 * `key` distinguishes two instances of one kind on one element, as
 * `key` distinguishes two children; without one they match by the
 * order they appear in among their own kind.
 */
export interface UiModifier<A = unknown> {
  readonly kind: UiModifierKind<A>;
  readonly args: A;
  readonly key?: string | number;
}

/**
 * Defines a modifier kind and returns its factory.
 *
 *   const hoverableKind = { name: 'hoverable', attach(host) { … } };
 *   export const hoverable = defineModifier(hoverableKind);
 *
 * The symbol is created here so two modules cannot accidentally share
 * a kind identity, and so a kind is never compared by name.
 */
export function defineModifier<A>(
  kind: Omit<UiModifierKind<A>, 'key'>
): ((args: A, key?: string | number) => UiModifier<A>) & { readonly kind: UiModifierKind<A> } {
  const full: UiModifierKind<A> = { ...kind, key: Symbol(kind.name) };
  const factory = (args: A, key?: string | number): UiModifier<A> => ({ kind: full, args, key });
  return Object.assign(factory, { kind: full });
}

export function isUiModifier(value: unknown): value is UiModifier {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const kind = (value as Partial<UiModifier>).kind;
  return typeof kind === 'object' && kind !== null && typeof kind.key === 'symbol' && typeof kind.attach === 'function';
}
