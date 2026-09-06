/**
 * Validators, and the shape a schema library plugs into.
 *
 * A validator is a function from a value to a message or `null`, which
 * is the smallest thing that can be composed, tested without a runtime
 * and written by an application in one line. Nothing here knows about
 * a field, a form or a control: `form.ts` runs these, and a value that
 * fails one gets the message it returned.
 *
 * The framework chooses no validation library. What it fixes is the
 * vocabulary a library's answers are translated into, which is
 * `Problems`, and an adapter for zod, valibot or a hand-written schema
 * is the ten lines that fill one in. See `Schema`.
 */

/**
 * A check on one field's value.
 *
 * Declared as a callable interface rather than a function type so
 * `required` can mark itself: a field whose checks include one carries
 * `required` into its control, and from there into the semantics tree,
 * without the author saying it twice.
 */
export interface Validator<T> {
  (value: T): string | null;
  /** `true` on `required`, and absent on everything else. */
  readonly requires?: boolean;
}

/**
 * A check that has to ask something: whether a handle is taken, whether
 * a coupon is live.
 *
 * It answers a message or `null`, exactly as a synchronous validator
 * does. What differs is what the form does while it is in flight, and
 * that is `resource`'s business rather than a fifth status enum: see
 * `Field.status` in `form.ts`.
 */
export type AsyncValidator<T> = (value: T) => Promise<string | null>;

/**
 * What a check over the whole form found.
 *
 * Messages by field name, and one for the form itself. The second is
 * for a problem that belongs to no single field ("these two dates are
 * the wrong way round" belongs to both), which is the case a per-field
 * validator cannot express and the reason this is a record rather than
 * a string.
 */
export interface Problems<V> {
  readonly fields?: { readonly [K in keyof V]?: string };
  readonly form?: string;
}

/** A check over every value at once; `null` when it found nothing. */
export type FormValidator<V> = (values: V) => Problems<V> | null;

/**
 * The seam a validation library plugs into.
 *
 * One method, taking the form's values and answering in `Problems`.
 * The framework depends on no schema library and never will: a form
 * that wants one writes the adapter, which for a library that reports
 * an issue list with a path is a loop over that list.
 *
 *   const schema: Schema<Values> = {
 *     check(values) {
 *       const answer = Account.safeParse(values);
 *       if (answer.success) {
 *         return null;
 *       }
 *       const fields: Record<string, string> = {};
 *       for (const issue of answer.error.issues) {
 *         const name = String(issue.path[0]);
 *         fields[name] ??= issue.message;
 *       }
 *       return { fields } as Problems<Values>;
 *     }
 *   };
 *
 * A schema runs before the form's own validators and beside the
 * fields' own, so adopting one does not mean giving up the two lines
 * of `required()` a field already had.
 */
export interface Schema<V> {
  check(values: V): Problems<V> | null;
}

/**
 * Nothing was entered.
 *
 * "Nothing" is per type, because a form asks one question of six
 * control shapes: an empty or blank string, an empty list, `null`,
 * `undefined`, `NaN` (which is what an empty `NumberInput` reports),
 * and `false`, which is an unticked box and the whole of what a
 * required checkbox means. Zero is a value, and so is an empty string
 * a caller deliberately allows by leaving this check off.
 */
export function required<T>(message = 'Enter a value'): Validator<T> {
  const check = (value: T): string | null => (isMissing(value) ? message : null);
  check.requires = true as const;
  return check;
}

/** At least `length` characters, or `length` entries in a list. */
export function minLength<T extends string | readonly unknown[]>(
  length: number,
  message = `Use at least ${length} characters`
): Validator<T> {
  return value => (value.length < length ? message : null);
}

/** At most `length` characters, or `length` entries in a list. */
export function maxLength<T extends string | readonly unknown[]>(
  length: number,
  message = `Use at most ${length} characters`
): Validator<T> {
  return value => (value.length > length ? message : null);
}

/**
 * Matches an expression.
 *
 * An empty value passes, so that `pattern` says what a value must look
 * like and `required` says whether there has to be one. Two checks,
 * two messages, and a field that is optional but must be well formed
 * when it is filled in needs no third.
 */
export function pattern(expression: RegExp, message = 'That is not in the right form'): Validator<string> {
  return value => (value === '' || expression.test(value) ? null : message);
}

/**
 * Looks like an address.
 *
 * Deliberately loose: something, an `@`, something with a dot in it,
 * and no spaces. The only check that settles whether an address exists
 * is sending to it, so a stricter expression here buys nothing and
 * turns away addresses that work.
 */
export function email(message = 'Enter an email address'): Validator<string> {
  return pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message);
}

/** Between `min` and `max`, both ends included. */
export function range(
  min: number,
  max: number,
  message = `Enter a number between ${min} and ${max}`
): Validator<number> {
  return value => (Number.isNaN(value) || value < min || value > max ? message : null);
}

/**
 * Every check in order, stopping at the first that has something to
 * say.
 *
 * A field takes a list already, so this is for the case where a
 * composed check is itself a value: a rule shared between two fields,
 * or the `each` of a field array.
 */
export function allOf<T>(...checks: readonly Validator<T>[]): Validator<T> {
  const composed = (value: T): string | null => firstProblem(checks, value);
  if (checks.some(check => check.requires === true)) {
    composed.requires = true as const;
  }
  return composed;
}

/**
 * Two fields that have to agree: a password and its confirmation, an
 * address typed twice.
 *
 * A form validator rather than a field one, because a check that reads
 * two values belongs to the thing that holds both. The message lands
 * on the second field, which is the one the person is being asked to
 * change.
 */
export function matches<V, K extends keyof V>(
  first: K,
  second: K,
  message = 'These two do not match'
): FormValidator<V> {
  return values =>
    values[first] === values[second] ? null : ({ fields: { [second]: message } } as unknown as Problems<V>);
}

/** The first message a list of checks has, or `null` when they all pass. */
export function firstProblem<T>(checks: readonly Validator<T>[], value: T): string | null {
  for (const check of checks) {
    const message = check(value);
    if (message !== null) {
      return message;
    }
  }
  return null;
}

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (typeof value === 'number') {
    return Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}
