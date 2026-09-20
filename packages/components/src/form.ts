import type { UiNodeRef } from '@gesso/core';

import {
  computed,
  internalState,
  resource,
  structurallyEqual,
  type ComponentContext,
  type ComputedCell,
  type InternalState,
  type ReadableCell,
  type Resource,
  type ResourceStatus
} from '@gesso/framework';

import { trackFocus, type ControlFocus } from './focus';
import {
  firstProblem,
  type AsyncValidator,
  type FormValidator,
  type Problems,
  type Schema,
  type Validator
} from './validate';

/**
 * A form group: fields by name, the four cells a screen binds, and a
 * submit that blocks.
 *
 * `TextInput` and `controlled()` were already as good as a good React
 * library. What was missing is the thing above them: something that
 * knows a screen has six fields, that two of them are wrong, that
 * nobody has touched the third yet, and which one the caret should go
 * to when the button is pressed. That is all this is. It is a helper
 * an author may use and not a data layer: a plain `TextInput` with
 * `controlled()` stays first class, a field can be backed by a channel
 * key instead of by anything the form owns, and nothing in the
 * framework requires a form group to exist
 *.
 *
 * A form is written as its fields:
 *
 *   const signUp = form(ctx, {
 *     email: field({ initial: '', validate: [required(), email()] }),
 *     terms: field({ initial: false, validate: [required('Accept the terms')] })
 *   }, {
 *     onSubmit: values => account.send.create(values)
 *   });
 *
 *   <TextInput label="Email" {...signUp.fields.email.bind()} />
 *   <Checkbox label="I accept" {...signUp.fields.terms.bind('checked')} />
 *   <Button label="Create account" onClick={() => void signUp.submit()} />
 *
 * `bind()` is the same idea as the framework's `bind()`, one level up:
 * it spreads the value, the writer, the message and the ref onto a
 * control, so the control keeps knowing nothing about forms.
 */

/** What the group drives every member by, whether it is one field or a list. */
export interface FormMember {
  readonly valid: ReadableCell<boolean>;
  readonly dirty: ReadableCell<boolean>;
  readonly touched: ReadableCell<boolean>;
  /** The state of the member's asynchronous check; see `Field.status`. */
  readonly status: ReadableCell<ResourceStatus>;
}

/** The checks a field keeps, whether it stands alone or is a row of a list. */
export interface FieldChecks<T> {
  readonly validate?: Validator<T> | readonly Validator<T>[];
  /** A check that has to ask something. One per field. */
  readonly validateAsync?: AsyncValidator<T>;
}

/**
 * How a field gets its value, and what makes it wrong.
 *
 * Either the form owns the value (`initial`) or something else does
 * (`value` plus `onChange`), and passing both throws naming the field,
 * for the reason `controlled()` throws: two owners is a bug rather
 * than a precedence rule to learn.
 *
 * The second form is what a real screen wants. A field is almost never
 * a component's own state: it is the application's, it lives on a
 * channel, and a channel view key is read-only with a command to write
 * it. That is two halves of one binding, and it is said out loud here
 * exactly as it is at a `bind()` call site:
 *
 *   query: field({ value: search.view.query, onChange: search.send.setQuery })
 */
export interface FieldOptions<T> extends FieldChecks<T> {
  /** The starting value, when the form owns the field. */
  readonly initial?: T;
  /** The value to show, when something else owns it: a channel view key. */
  readonly value?: ReadableCell<T>;
  /** How a change is written back. Required with `value`, optional without. */
  readonly onChange?: (next: T) => void;
  /** What to call the field in a warning; the form's key by default. */
  readonly label?: string;
}

/**
 * What a control needs from a field, ready to spread.
 *
 * `required` is a plain boolean rather than a cell because a field's
 * checks are fixed when it is made, and it is here at all so that a
 * `required()` validator is written once and still reaches the
 * semantics tree.
 *
 * The value's prop is named, because the library's controls do not all
 * call it `value`: a `Checkbox` takes `checked`. `bindAs('checked')` is
 * what keeps a `Checkbox` from also being handed a `value` prop it
 * would reject.
 */
export type FieldBinding<T, V extends string = 'value'> = {
  readonly ref: UiNodeRef;
  readonly onChange: (next: T) => void;
  readonly error: ReadableCell<string>;
  readonly required: boolean;
} & { readonly [K in V]: ReadableCell<T> };

/** One field of a form. */
export interface Field<T> extends FormMember {
  /** The form's key for it, once it has been registered. */
  readonly name: string;
  readonly value: ReadableCell<T>;
  /**
   * What is wrong with it, whether or not it is being shown.
   *
   * The first message its own checks have, then a message the form's
   * validators or its schema addressed to it, then the answer of its
   * asynchronous check. Empty when it passes.
   */
  readonly message: ReadableCell<string>;
  /**
   * What the control shows: `message`, once the field has been left or
   * the form has been submitted, and empty before that.
   *
   * Nobody should be told they got it wrong while they are still
   * typing it for the first time, which is the whole of the rule.
   */
  readonly error: ReadableCell<string>;
  /**
   * Where its asynchronous check has got to, in `resource`'s five
   * words.
   *
   * `idle` when the field has no asynchronous check, or when its own
   * checks fail and there is nothing worth asking about. `loading`
   * while a request is out: the field shows no message yet, because
   * there is nothing to say, and it is **not valid**, so a submit
   * blocks rather than racing the answer. `ready` when the check
   * answered, with or without a message. `failed` when the check could
   * not be made at all, which counts as invalid and shows the reason:
   * a form must not quietly pass a rule it never managed to apply.
   * `missing` never occurs, because a check that answers "no message"
   * is an answer.
   */
  readonly status: ReadableCell<ResourceStatus>;
  /** Whether the value differs from the one the field started with. */
  readonly dirty: ReadableCell<boolean>;
  /** Whether the person has been in the field and left it again. */
  readonly touched: ReadableCell<boolean>;
  readonly valid: ReadableCell<boolean>;
  /** True when a `required()` check is among its validators. */
  readonly required: boolean;
  /** The value, the writer, the message and the ref, to spread on a control. */
  bind(): FieldBinding<T, 'value'>;
  /** The same, for a control that calls the value something else. */
  bindAs<V extends string>(value: V): FieldBinding<T, V>;
  change(next: T): void;
  /** Marks it as left, which is what makes its message show. */
  touch(): void;
  /** Puts the caret in it. */
  focus(): void;
  reset(): void;
}

/** One row of a field array: a field, and a key that survives a removal. */
export interface FieldRow<T> {
  readonly key: string;
  readonly field: Field<T>;
}

export interface FieldArrayOptions<T> {
  /** The rows the list starts with. */
  readonly initial?: readonly T[];
  /** The checks every row keeps. */
  readonly each?: FieldChecks<T>;
  /** Checks over the list itself: "add at least one". */
  readonly validate?: Validator<readonly T[]> | readonly Validator<readonly T[]>[];
}

/**
 * A list of fields that grows and shrinks: tags, guests, the lines of
 * an invoice.
 *
 * Each row is an ordinary `Field`, so a row validates, shows its own
 * message and takes the caret exactly as a top-level field does. The
 * key is minted when the row is added and never reused, which is what
 * lets `Each` keep the right editor over the right row when one in the
 * middle is removed.
 *
 * A field array owns its rows. A list that lives on the far side of
 * the barrier is added to and removed from by commands, and a helper
 * that pretended to own it would be inventing a second copy of the
 * application's state to disagree with the first.
 */
export interface FieldArray<T> extends FormMember {
  readonly name: string;
  readonly value: ReadableCell<readonly T[]>;
  readonly rows: ReadableCell<readonly FieldRow<T>[]>;
  /** What is wrong with the list itself, once the form has been submitted. */
  readonly error: ReadableCell<string>;
  add(value: T): Field<T>;
  remove(key: string): void;
  move(from: number, to: number): void;
  touch(): void;
  reset(): void;
}

/** The members of a form, by name. */
export type FormMembers = Readonly<Record<string, FormMember>>;

/** What one member holds: the field's value, or the array's list. */
export type ValueOf<M> = M extends FieldArray<infer T> ? readonly T[] : M extends Field<infer U> ? U : never;

/** Every member's value, by name: what a submit hands to its handler. */
export type FormValues<M extends FormMembers> = { readonly [K in keyof M]: ValueOf<M[K]> };

export interface FormOptions<M extends FormMembers> {
  /** Checks over every value at once, run in order. */
  readonly validate?: FormValidator<FormValues<M>> | readonly FormValidator<FormValues<M>>[];
  /** A validation library, adapted; run before `validate`. */
  readonly schema?: Schema<FormValues<M>>;
  /** What a valid submit does. */
  readonly onSubmit?: (values: FormValues<M>) => void | Promise<void>;
}

export interface FormGroup<M extends FormMembers> {
  /** The members, exactly the object that was passed, so the types survive. */
  readonly fields: M;
  readonly values: ReadableCell<FormValues<M>>;
  readonly valid: ReadableCell<boolean>;
  readonly dirty: ReadableCell<boolean>;
  readonly touched: ReadableCell<boolean>;
  readonly submitted: ReadableCell<boolean>;
  /** The worst status among the members; see `Field.status`. */
  readonly status: ReadableCell<ResourceStatus>;
  /** A message about the form as a whole, once it has been submitted. */
  readonly error: ReadableCell<string>;
  /**
   * Marks every field touched, blocks on invalid, and runs the handler.
   *
   * The answer is whether the handler ran. A form that is not valid
   * puts the caret in the first field that failed, in the order the
   * fields were declared, which is the order they are on screen.
   *
   * **The handler runs in the same task when nothing is pending.**
   * That is deliberate and it is load bearing: a browser grants a
   * popup, a clipboard write or a file picker only while the gesture
   * that asked for it is fresh, so a submit that always awaited would
   * quietly break every handler that opens one. The promise is still
   * returned, and it is what to await when a field has an
   * asynchronous check in flight: then, and only then, the form waits
   * for the answer before deciding.
   */
  submit(): Promise<boolean>;
  reset(): void;
  /** Gives back the subscriptions the asynchronous checks hold. */
  dispose(): void;
}

/** A field, before a form has been given it. */
export function field<T>(options: FieldOptions<T>): Field<T> {
  return new FieldHandle(options);
}

/** A list of fields, before a form has been given it. */
export function fieldArray<T>(options: FieldArrayOptions<T> = {}): FieldArray<T> {
  return new FieldArrayHandle(options);
}

/**
 * A form over the fields it is given.
 *
 * Takes the component's context because a form does two things a
 * component does: it puts the caret somewhere, which is the focus
 * service's job, and it follows every field for as long as the screen
 * is up, which has to be given back when the screen goes away. Both
 * are wired here so no caller writes them.
 */
export function form<M extends FormMembers>(
  ctx: ComponentContext,
  fields: M,
  options: FormOptions<M> = {}
): FormGroup<M> {
  const group = new FormHandle(ctx, fields, options);
  ctx.onUnmount(() => group.dispose());
  return group;
}

// ---------------------------------------------------------------------------
// The implementations. Not exported: a field is reached through `field()`
// and a form through `form()`, and the internal methods the group drives
// its members by are visible here and nowhere else.
// ---------------------------------------------------------------------------

/** What a member can ask its form: the messages addressed to it. */
interface FormHost {
  problemFor(name: string): string;
  submittedNow(): boolean;
}

/** A field with no asynchronous check has this status, and never writes it. */
const NOT_ASKED: ReadableCell<ResourceStatus> = internalState<ResourceStatus>('idle', 'field.status');

/** Rows are keyed by mint, never by index; see `FieldArray`. */
let rowCounter = 0;

class FieldHandle<T> implements Field<T> {
  name = '';
  readonly value: ReadableCell<T>;
  readonly message: ComputedCell<string>;
  readonly error: ComputedCell<string>;
  readonly valid: ComputedCell<boolean>;
  readonly dirty: ComputedCell<boolean>;
  readonly touched: ReadableCell<boolean>;
  readonly status: ReadableCell<ResourceStatus>;
  readonly required: boolean;

  private readonly checks: readonly Validator<T>[];
  private readonly write: (next: T) => void;
  private readonly baseline: T;
  private readonly touchedCell: InternalState<boolean> = internalState(false);
  private readonly check: Resource<Asked<T>, Answer> | null;
  /**
   * The last value the field's own checks were run over, and what they
   * said.
   *
   * A validator is the author's code and may be as expensive as they
   * like, and a computed re-attaches its sources whenever the set of
   * them changes, which for a field array means every row's cells on
   * every add. Remembering one answer makes that re-attachment free,
   * and the memory is one pair per field.
   */
  private lastChecked: { value: T; message: string | null } | null = null;
  private host: FormHost | null = null;
  private focusing: ControlFocus | null = null;
  private entered = false;
  /** One writer for the field's life; see `bind`. */
  private readonly changed = (next: T): void => this.change(next);

  constructor(options: FieldOptions<T>) {
    const supplied = options.value;
    if (supplied !== undefined && options.initial !== undefined) {
      throw new Error(
        `A field was given both 'value' and 'initial'. Pass 'value' with 'onChange' for something else to own it, ` +
          `or 'initial' for the form to.`
      );
    }
    this.checks = listOf(options.validate);
    this.required = this.checks.some(check => check.requires === true);
    if (supplied === undefined) {
      const cell = internalState(options.initial as T, options.label);
      this.value = cell;
      this.write = next => {
        cell.value = next;
        options.onChange?.(next);
      };
    } else {
      this.value = supplied;
      // A field the application owns and gives no writer to does not
      // move, which is what `readOnly` does and for the same reason.
      this.write = options.onChange ?? (() => {});
    }
    this.baseline = this.value.value;
    this.check = this.asking(options.validateAsync);
    this.status = this.check === null ? NOT_ASKED : this.check.status;
    this.touched = this.touchedCell;

    this.message = computed(() => this.messageNow());
    this.valid = computed(() => this.message.value === '' && this.status.value !== 'loading');
    this.error = computed(() =>
      this.touchedCell.value || this.host?.submittedNow() === true ? this.message.value : ''
    );
    this.dirty = computed(() => !structurallyEqual(this.value.value, this.baseline));
  }

  bind(): FieldBinding<T, 'value'> {
    return this.bindAs('value');
  }

  bindAs<V extends string>(value: V): FieldBinding<T, V> {
    const focusing = this.focusing;
    if (focusing === null) {
      throw new Error(`The field '${this.name}' was bound before a form was given it. Pass it to form(ctx, { ... }).`);
    }
    // The ref, the writer and the message cell are the field's own and
    // keep their identity for its life, so binding a control twice
    // hands it the same handler rather than a fresh one to re-attach.
    return {
      ref: focusing.ref,
      onChange: this.changed,
      error: this.error,
      required: this.required,
      [value]: this.value
    } as FieldBinding<T, V>;
  }

  change(next: T): void {
    this.write(next);
  }

  touch(): void {
    this.touchedCell.value = true;
  }

  focus(): void {
    this.focusing?.focus();
  }

  reset(): void {
    this.write(this.baseline);
    this.touchedCell.value = false;
    this.entered = false;
  }

  /** Called by the form, once, when it takes the field. */
  attach(ctx: ComponentContext, host: FormHost, name: string): void {
    this.host = host;
    this.name = name;
    const focusing = trackFocus(ctx);
    this.focusing = focusing;
    // Left, rather than entered: a field is touched when the person
    // has been in it and gone, which is when they have finished
    // saying what they had to say about it.
    ctx.effect(focusing.focused, on => {
      if (on) {
        this.entered = true;
      } else if (this.entered) {
        this.touchedCell.value = true;
      }
    });
  }

  /** The promise of the check in flight, already resolved when there is none. */
  settled(): Promise<void> {
    return this.check?.settled ?? Promise.resolve();
  }

  dispose(): void {
    this.check?.dispose();
  }

  /** The first message the field's own checks have, remembered per value. */
  private ownProblem(): string | null {
    const value = this.value.value;
    const last = this.lastChecked;
    if (last !== null && Object.is(last.value, value)) {
      return last.message;
    }
    const message = firstProblem(this.checks, value);
    this.lastChecked = { value, message };
    return message;
  }

  /**
   * The asynchronous check as a `resource`, keyed on the value.
   *
   * A resource is what makes a stale answer impossible: the value is
   * the key, so typing on while a check is out drops the old answer
   * rather than letting it land on a value it was never about. The key
   * goes `null` while the field's own checks fail, because there is no
   * point asking a server whether an empty handle is taken, and `null`
   * is exactly `idle`.
   */
  private asking(ask: AsyncValidator<T> | undefined): Resource<Asked<T>, Answer> | null {
    if (ask === undefined) {
      return null;
    }
    const key = computed<Asked<T> | null>(() => (this.ownProblem() === null ? { value: this.value.value } : null), {
      equal: 'structural'
    });
    return resource(key, asked => ask(asked.value).then(message => ({ message }) as Answer));
  }

  private messageNow(): string {
    const own = this.ownProblem();
    if (own !== null) {
      return own;
    }
    const outside = this.host?.problemFor(this.name) ?? '';
    if (outside !== '') {
      return outside;
    }
    if (this.check === null) {
      return '';
    }
    const state = this.check.state.value;
    if (state.status === 'failed') {
      return state.error ?? 'This could not be checked.';
    }
    return state.status === 'ready' ? (state.value?.message ?? '') : '';
  }
}

class FieldArrayHandle<T> implements FieldArray<T> {
  name = '';
  readonly value: ComputedCell<readonly T[]>;
  readonly rows: ReadableCell<readonly FieldRow<T>[]>;
  readonly error: ComputedCell<string>;
  readonly valid: ComputedCell<boolean>;
  readonly dirty: ComputedCell<boolean>;
  readonly touched: ComputedCell<boolean>;
  readonly status: ComputedCell<ResourceStatus>;

  private readonly rowsCell: InternalState<readonly FieldRow<T>[]>;
  private readonly checks: readonly Validator<readonly T[]>[];
  private readonly baseline: readonly T[];
  private ctx: ComponentContext | null = null;
  private host: FormHost | null = null;

  constructor(private readonly options: FieldArrayOptions<T>) {
    this.checks = listOf(options.validate);
    this.baseline = options.initial ?? [];
    this.rowsCell = internalState<readonly FieldRow<T>[]>([]);
    this.rows = this.rowsCell;
    this.value = computed<readonly T[]>(() => this.rowsCell.value.map(row => row.field.value.value), {
      equal: 'structural'
    });
    this.error = computed(() => {
      const host = this.host;
      if (host === null || !host.submittedNow()) {
        return '';
      }
      return firstProblem(this.checks, this.value.value) ?? host.problemFor(this.name);
    });
    this.valid = computed(
      () =>
        firstProblem(this.checks, this.value.value) === null &&
        (this.host?.problemFor(this.name) ?? '') === '' &&
        this.rowsCell.value.every(row => row.field.valid.value)
    );
    this.dirty = computed(
      () =>
        !structurallyEqual(this.value.value, this.baseline) || this.rowsCell.value.some(row => row.field.dirty.value)
    );
    this.touched = computed(() => this.rowsCell.value.some(row => row.field.touched.value));
    this.status = computed(() => worstOf(this.rowsCell.value.map(row => row.field.status.value)));
  }

  add(value: T): Field<T> {
    const row = this.mint(value);
    this.rowsCell.value = [...this.rowsCell.value, row];
    return row.field;
  }

  remove(key: string): void {
    const rows = this.rowsCell.value;
    const going = rows.find(row => row.key === key);
    if (going === undefined) {
      return;
    }
    (going.field as FieldHandle<T>).dispose();
    this.rowsCell.value = rows.filter(row => row.key !== key);
  }

  move(from: number, to: number): void {
    const rows = [...this.rowsCell.value];
    if (from < 0 || to < 0 || from >= rows.length || to >= rows.length || from === to) {
      return;
    }
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    this.rowsCell.value = rows;
  }

  touch(): void {
    for (const row of this.rowsCell.value) {
      row.field.touch();
    }
  }

  reset(): void {
    this.disposeRows();
    this.rowsCell.value = this.baseline.map(value => this.mint(value));
  }

  attach(ctx: ComponentContext, host: FormHost, name: string): void {
    this.ctx = ctx;
    this.host = host;
    this.name = name;
    this.rowsCell.value = this.baseline.map(value => this.mint(value));
  }

  settled(): Promise<void> {
    return Promise.all(this.rowsCell.value.map(row => (row.field as FieldHandle<T>).settled())).then(() => undefined);
  }

  dispose(): void {
    this.disposeRows();
  }

  /** The first row that fails, for the form's "focus the first error". */
  firstFailure(): Field<T> | null {
    return this.rowsCell.value.find(row => !row.field.valid.value)?.field ?? null;
  }

  private mint(value: T): FieldRow<T> {
    const ctx = this.ctx;
    const host = this.host;
    if (ctx === null || host === null) {
      throw new Error(`The field array '${this.name}' was used before a form was given it.`);
    }
    const key = `row-${rowCounter++}`;
    const row = new FieldHandle<T>({ initial: value, ...this.options.each });
    // Named by the array and the row, so a warning about a cell says
    // which row it came from rather than which index it was at.
    row.attach(ctx, host, `${this.name}.${key}`);
    return { key, field: row };
  }

  private disposeRows(): void {
    for (const row of this.rowsCell.value) {
      (row.field as FieldHandle<T>).dispose();
    }
  }
}

class FormHandle<M extends FormMembers> implements FormGroup<M>, FormHost {
  readonly values: ComputedCell<FormValues<M>>;
  readonly valid: ComputedCell<boolean>;
  readonly dirty: ComputedCell<boolean>;
  readonly touched: ComputedCell<boolean>;
  readonly submitted: ReadableCell<boolean>;
  readonly status: ComputedCell<ResourceStatus>;
  readonly error: ComputedCell<string>;

  private readonly members: readonly (FieldHandle<never> | FieldArrayHandle<never>)[];
  private readonly names: readonly string[];
  private readonly rules: readonly FormValidator<FormValues<M>>[];
  private readonly problems: ComputedCell<Problems<FormValues<M>> | null>;
  private readonly submittedCell: InternalState<boolean> = internalState(false);

  constructor(
    ctx: ComponentContext,
    readonly fields: M,
    private readonly options: FormOptions<M>
  ) {
    this.names = Object.keys(fields);
    this.members = this.names.map(name => fields[name] as unknown as FieldHandle<never> | FieldArrayHandle<never>);
    this.rules = listOf(options.validate);
    this.submitted = this.submittedCell;
    for (let index = 0; index < this.names.length; index++) {
      this.members[index].attach(ctx, this, this.names[index]);
    }

    // Structural, because the record is rebuilt on every read and a
    // rebuilt equal one is not a change. Without it every keystroke in
    // one field would re-run the form's validators and re-emit to
    // everything bound to `values`.
    this.values = computed(() => this.valuesNow(), { equal: 'structural', label: 'form.values' });
    this.problems = computed(() => this.problemsNow(), { equal: 'structural', label: 'form.problems' });
    this.valid = computed(
      () => this.members.every(member => member.valid.value) && (this.problems.value?.form ?? '') === ''
    );
    this.dirty = computed(() => this.members.some(member => member.dirty.value));
    this.touched = computed(() => this.members.some(member => member.touched.value));
    this.status = computed(() => worstOf(this.members.map(member => member.status.value)));
    this.error = computed(() => (this.submittedCell.value ? (this.problems.value?.form ?? '') : ''));
  }

  problemFor(name: string): string {
    const problems = this.problems.value;
    return (problems?.fields as Record<string, string | undefined> | undefined)?.[name] ?? '';
  }

  submittedNow(): boolean {
    return this.submittedCell.value;
  }

  submit(): Promise<boolean> {
    this.submittedCell.value = true;
    for (const member of this.members) {
      member.touch();
    }
    if (this.status.value !== 'loading') {
      // Synchronously, so a handler that opens a window still has the
      // gesture that asked for one. See `FormGroup.submit`.
      return this.finish();
    }
    return Promise.all(this.members.map(member => member.settled())).then(() => this.finish());
  }

  reset(): void {
    for (const member of this.members) {
      member.reset();
    }
    this.submittedCell.value = false;
  }

  dispose(): void {
    for (const member of this.members) {
      member.dispose();
    }
  }

  private finish(): Promise<boolean> {
    if (!this.valid.value) {
      this.focusFailure();
      return Promise.resolve(false);
    }
    const answer = this.options.onSubmit?.(this.values.value);
    return answer instanceof Promise ? answer.then(() => true) : Promise.resolve(true);
  }

  /** The caret goes to the first field that failed, in declaration order. */
  private focusFailure(): void {
    for (const member of this.members) {
      if (member.valid.value) {
        continue;
      }
      if (member instanceof FieldArrayHandle) {
        member.firstFailure()?.focus();
      } else {
        member.focus();
      }
      return;
    }
  }

  private valuesNow(): FormValues<M> {
    const values: Record<string, unknown> = {};
    for (let index = 0; index < this.names.length; index++) {
      values[this.names[index]] = this.members[index].value.value;
    }
    return values as FormValues<M>;
  }

  private problemsNow(): Problems<FormValues<M>> | null {
    const values = this.values.value;
    let found = this.options.schema?.check(values) ?? null;
    for (const rule of this.rules) {
      found = merge(found, rule(values));
    }
    return found;
  }
}

/** What the asynchronous check is asked about, so a key is never `null` by value. */
interface Asked<T> {
  readonly value: T;
}

/** What it answers: a message, or none. Never `null`, so `missing` cannot occur. */
interface Answer {
  readonly message: string | null;
}

/**
 * The worst of a set of statuses.
 *
 * `loading` wins, because a form with one check in the air is a form
 * that is waiting; then `failed`, because a check that could not be
 * made is the next most interesting thing; `idle` only when nothing
 * has been asked at all.
 */
function worstOf(statuses: readonly ResourceStatus[]): ResourceStatus {
  let seen: ResourceStatus = 'idle';
  for (const status of statuses) {
    if (status === 'loading') {
      return 'loading';
    }
    if (status === 'failed') {
      seen = 'failed';
    } else if (status === 'ready' && seen === 'idle') {
      seen = 'ready';
    }
  }
  return seen;
}

/** Later messages fill gaps rather than replacing what an earlier rule said. */
function merge<V>(first: Problems<V> | null, second: Problems<V> | null): Problems<V> | null {
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }
  return {
    fields: { ...second.fields, ...first.fields },
    form: first.form ?? second.form
  };
}

function listOf<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return EMPTY;
  }
  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

const EMPTY: readonly never[] = [];
