import { describe, expect, it } from 'vitest';

import {
  createComponent,
  each,
  internalState,
  type ComponentContext,
  type Inputs,
  type ReadableCell
} from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, type UiChild } from 'gesso-core';

import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { field, fieldArray, form, type Field, type FieldArray } from './form';
import { TextInput } from './TextInput';
import { email, matches, minLength, required, type Problems, type Schema } from './validate';

/**
 * The form group, driven the way a person drives it.
 *
 * Every claim the page makes is checked through the tree a screen
 * reader reads rather than through the group's cells alone: a message
 * that is true in a cell and absent from the semantics is a message
 * nobody hears, and the whole reason a form is a component library's
 * problem rather than an application's is that it has to be both.
 */

/**
 * The group the component under test built, for a spec to drive it
 * directly.
 *
 * Held in the shape a spec reads rather than with each form's own field
 * types, because what is being specified here is the group's behaviour
 * and not its inference; `createComponent.types.spec.ts` is where types
 * are the subject.
 */
interface AnyForm {
  readonly fields: Readonly<Record<string, Field<never>>>;
  readonly values: ReadableCell<Readonly<Record<string, unknown>>>;
  readonly valid: ReadableCell<boolean>;
  readonly dirty: ReadableCell<boolean>;
  readonly touched: ReadableCell<boolean>;
  readonly submitted: ReadableCell<boolean>;
  readonly error: ReadableCell<string>;
  submit(): Promise<boolean>;
  reset(): void;
}

let built: AnyForm | null = null;

function mount(root: Parameters<typeof renderTest>[0]) {
  return renderTest(root, { width: 420, height: 520 });
}

interface SignUpProps {
  onSubmit?: (values: { email: string; handle: string; terms: boolean }) => void;
  checkHandle?: (handle: string) => Promise<string | null>;
}

/** The shape every form has: three fields, three rules, one button. */
function SignUp(inputs: Inputs<SignUpProps>, ctx: ComponentContext): UiChild {
  const group = form(
    ctx,
    {
      email: field({ initial: '', validate: [required('Enter an address'), email()] }),
      handle: field({
        initial: '',
        validate: [required('Choose a handle'), minLength(3, 'Handles are three characters or more')],
        ...(inputs.checkHandle.value === undefined ? {} : { validateAsync: inputs.checkHandle.value })
      }),
      terms: field({ initial: false, validate: [required('Accept the terms')] })
    },
    { onSubmit: values => inputs.onSubmit.emit(values) }
  );
  built = group as unknown as AnyForm;
  return Column(
    { gap: 10, padding: 12 },
    createComponent(TextInput, { label: 'Email', ...group.fields.email.bind() }),
    createComponent(TextInput, { label: 'Handle', ...group.fields.handle.bind() }),
    createComponent(Checkbox, { label: 'Terms', ...group.fields.terms.bindAs('checked') }),
    createComponent(Button, { label: 'Create account', onClick: () => void group.submit() })
  );
}

describe('a form group', () => {
  it('says nothing until a field has been left, or the form submitted', () => {
    const ui = mount(createComponent(SignUp, {}));

    expect(ui.queryByText('Enter an address')).toBeNull();

    ui.fireEvent.focus(ui.getAllByRole('textbox')[0]);
    ui.fireEvent.type('nope');
    ui.fireEvent.blur();
    ui.frame();

    expect(ui.getByText('Enter an email address')).toBeDefined();
  });

  it('blocks the submit and puts the caret in the first field that failed', () => {
    const sent: unknown[] = [];
    const ui = mount(createComponent(SignUp, { onSubmit: values => sent.push(values) }));

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(sent).toEqual([]);
    // The first in declaration order, which is the first on screen.
    expect(ui.runtime.input.focus.focusedNode).toBe(ui.getAllByRole('textbox')[0]);
    expect(ui.getByText('Enter an address')).toBeDefined();
    expect(ui.getByText('Choose a handle')).toBeDefined();
    expect(ui.getByText('Accept the terms')).toBeDefined();
  });

  it('submits once every rule passes, and hands the handler plain values', () => {
    const sent: unknown[] = [];
    const ui = mount(createComponent(SignUp, { onSubmit: values => sent.push(values) }));
    const [address, handle] = ui.getAllByRole('textbox');

    ui.fireEvent.focus(address);
    ui.fireEvent.type('ada@example.com');
    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    expect(sent).toEqual([{ email: 'ada@example.com', handle: 'ada', terms: true }]);
  });

  it('runs the handler in the same task, so a press keeps its gesture', () => {
    const order: string[] = [];
    const ui = mount(createComponent(SignUp, { onSubmit: () => order.push('handler') }));
    const [address, handle] = ui.getAllByRole('textbox');

    ui.fireEvent.focus(address);
    ui.fireEvent.type('ada@example.com');
    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    // The press itself, not a turn of the event loop later: a browser
    // grants a popup only while the gesture is fresh.
    ui.fireEvent.click(ui.getByRole('button'));
    order.push('after the press');

    expect(order).toEqual(['handler', 'after the press']);
  });

  it('announces the message and reads it after the field name', () => {
    const ui = mount(createComponent(SignUp, {}));

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    const message = ui.getByText('Enter an address');
    expect(ui.getSemantics(message).live).toBe('polite');
    expect(ui.getAllByRole('textbox')[0]).toHaveSemantics({
      name: 'Email',
      states: ['invalid', 'required']
    });
    // Read after the name when focus lands, which is how somebody who
    // arrives at a field already marked wrong finds out why.
    expect(ui.getSemantics(ui.getAllByRole('textbox')[0]).description).toBe('Enter an address');
  });

  it('carries required from the validator into the semantics tree', () => {
    const ui = mount(createComponent(SignUp, {}));

    expect(ui.getSemantics(ui.getAllByRole('textbox')[0]).states).toContain('required');
  });

  it('reports dirty, touched and submitted as cells', () => {
    const ui = mount(createComponent(SignUp, {}));
    const group = built!;

    expect(group.dirty.value).toBe(false);
    expect(group.touched.value).toBe(false);
    expect(group.submitted.value).toBe(false);

    ui.fireEvent.focus(ui.getAllByRole('textbox')[0]);
    ui.fireEvent.type('a');
    ui.fireEvent.blur();
    ui.frame();

    expect(group.dirty.value).toBe(true);
    expect(group.touched.value).toBe(true);

    ui.fireEvent.click(ui.getByRole('button'));
    expect(group.submitted.value).toBe(true);
  });

  it('goes back to where it started on reset', () => {
    const ui = mount(createComponent(SignUp, {}));
    const group = built!;

    ui.fireEvent.focus(ui.getAllByRole('textbox')[0]);
    ui.fireEvent.type('a');
    ui.fireEvent.blur();
    ui.frame();

    group.reset();
    ui.frame();

    expect(group.dirty.value).toBe(false);
    expect(group.touched.value).toBe(false);
    expect(ui.queryByText('Enter an address')).toBeNull();
  });
});

describe('a field the application owns', () => {
  /**
   * A channel view key is a read-only cell with a command beside it,
   * which is exactly this shape: the value comes from outside and the
   * change goes back out through the writer. Nothing here is a cell the
   * form owns, and that is the point.
   */
  function Filter(inputs: Inputs<{ query: string; onQuery: (next: string) => void }>, ctx: ComponentContext): UiChild {
    const group = form(ctx, {
      query: field({
        value: inputs.query,
        onChange: (next: string) => inputs.onQuery.emit(next),
        validate: [minLength(2, 'Type at least two characters')]
      })
    });
    built = group as unknown as AnyForm;
    return createComponent(TextInput, { label: 'Search', ...group.fields.query.bind() });
  }

  it('shows what the owner holds and writes every change back out', () => {
    const held = internalState('');
    const commands: string[] = [];
    const ui = mount(
      createComponent(Filter, {
        query: held,
        onQuery: (next: string) => {
          commands.push(next);
          held.value = next;
        }
      })
    );

    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('ab');
    ui.frame();

    expect(commands).toEqual(['ab']);
    expect(built!.values.value).toEqual({ query: 'ab' });

    // The owner changing it is the other half: a patch arrives and the
    // field follows without anybody having typed.
    held.value = 'from the application';
    ui.frame();

    expect(built!.values.value).toEqual({ query: 'from the application' });
  });

  it('validates a value it does not own', () => {
    const held = internalState('a');
    const ui = mount(createComponent(Filter, { query: held, onQuery: (next: string) => (held.value = next) }));

    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.blur();
    ui.frame();

    expect(ui.getByText('Type at least two characters')).toBeDefined();
    expect(built!.valid.value).toBe(false);
  });
});

describe('a check that has to ask something', () => {
  function answerLater(): {
    ask: (handle: string) => Promise<string | null>;
    answer: (message: string | null) => void;
    refuse: (reason: Error) => void;
  } {
    let settle: (message: string | null) => void = () => {};
    let reject: (reason: Error) => void = () => {};
    return {
      ask: () =>
        new Promise<string | null>((resolve, fail) => {
          settle = resolve;
          reject = fail;
        }),
      answer: message => settle(message),
      refuse: reason => reject(reason)
    };
  }

  it('is loading while it is out, and the form is not valid meanwhile', async () => {
    const check = answerLater();
    const ui = mount(createComponent(SignUp, { checkHandle: check.ask }));
    const [address, handle] = ui.getAllByRole('textbox');

    ui.fireEvent.focus(address);
    ui.fireEvent.type('ada@example.com');
    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    const group = built!;
    expect(group.fields.handle.status.value).toBe('loading');
    // Nothing is shown, because there is nothing to say yet. What is
    // true is that the form will not go until it hears back.
    expect(ui.queryByText('That handle is taken')).toBeNull();
    expect(group.valid.value).toBe(false);

    check.answer(null);
    await ui.settle();

    expect(group.fields.handle.status.value).toBe('ready');
    expect(group.valid.value).toBe(true);
  });

  it('waits for the answer when the button is pressed while it is out', async () => {
    const check = answerLater();
    const sent: unknown[] = [];
    const ui = mount(createComponent(SignUp, { checkHandle: check.ask, onSubmit: values => sent.push(values) }));
    const [address, handle] = ui.getAllByRole('textbox');

    ui.fireEvent.focus(address);
    ui.fireEvent.type('ada@example.com');
    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.click(ui.getByRole('checkbox'));
    ui.frame();

    const submitting = built!.submit();
    expect(sent).toEqual([]);

    check.answer(null);
    await expect(submitting).resolves.toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('shows what the check said, and blocks', async () => {
    const check = answerLater();
    const ui = mount(createComponent(SignUp, { checkHandle: check.ask }));
    const handle = ui.getAllByRole('textbox')[1];

    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.blur();
    ui.frame();

    check.answer('That handle is taken');
    await ui.settle();

    expect(ui.getByText('That handle is taken')).toBeDefined();
    expect(built!.fields.handle.valid.value).toBe(false);
  });

  it('counts a check that could not be made as a failure rather than a pass', async () => {
    const check = answerLater();
    const ui = mount(createComponent(SignUp, { checkHandle: check.ask }));
    const handle = ui.getAllByRole('textbox')[1];

    ui.fireEvent.focus(handle);
    ui.fireEvent.type('ada');
    ui.fireEvent.blur();
    ui.frame();

    check.refuse(new Error('The network is down'));
    await ui.settle();

    expect(built!.fields.handle.status.value).toBe('failed');
    expect(ui.getByText('The network is down')).toBeDefined();
    expect(built!.fields.handle.valid.value).toBe(false);
  });

  it('does not ask while the field fails its own checks', () => {
    let asked = 0;
    const ui = mount(
      createComponent(SignUp, {
        checkHandle: (handle: string) => {
          asked++;
          return Promise.resolve(handle === 'ada' ? null : 'taken');
        }
      })
    );

    ui.fireEvent.focus(ui.getAllByRole('textbox')[1]);
    ui.fireEvent.type('a');
    ui.frame();

    // One character fails `minLength`, so there is nothing worth
    // asking a server about.
    expect(asked).toBe(0);
    expect(built!.fields.handle.status.value).toBe('idle');
  });
});

describe('checks over the whole form', () => {
  function Passwords(_inputs: Inputs<{}>, ctx: ComponentContext): UiChild {
    const group = form(
      ctx,
      {
        password: field({ initial: '', validate: [required('Choose a password')] }),
        again: field({ initial: '' })
      },
      { validate: matches('password', 'again', 'The two passwords do not match') }
    );
    built = group as unknown as AnyForm;
    return Column(
      { gap: 10, padding: 12 },
      createComponent(TextInput, { label: 'Password', ...group.fields.password.bind() }),
      createComponent(TextInput, { label: 'Again', ...group.fields.again.bind() })
    );
  }

  it('puts a cross-field message on the field the person has to change', () => {
    const ui = mount(createComponent(Passwords, {}));
    const [first, second] = ui.getAllByRole('textbox');

    ui.fireEvent.focus(first);
    ui.fireEvent.type('correct horse');
    ui.fireEvent.focus(second);
    ui.fireEvent.type('battery staple');
    ui.fireEvent.blur();
    ui.frame();

    expect(ui.getByText('The two passwords do not match')).toBeDefined();
    expect(built!.valid.value).toBe(false);
  });

  it('takes a schema adapter, with no dependency on a schema library', () => {
    const schema: Schema<{ password: string; again: string }> = {
      check: values =>
        values.password.length >= 8
          ? null
          : ({ fields: { password: 'Use eight characters or more' } } as Problems<{
              password: string;
              again: string;
            }>)
    };
    function Guarded(_inputs: Inputs<{}>, ctx: ComponentContext): UiChild {
      const group = form(
        ctx,
        { password: field({ initial: 'short' }), again: field({ initial: 'short' }) },
        { schema }
      );
      built = group as unknown as AnyForm;
      return createComponent(TextInput, { label: 'Password', ...group.fields.password.bind() });
    }

    const ui = mount(createComponent(Guarded, {}));
    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.blur();
    ui.frame();

    expect(ui.getByText('Use eight characters or more')).toBeDefined();
  });
});

describe('a field array', () => {
  let tags: FieldArray<string> | null = null;

  function Tags(_inputs: Inputs<{}>, ctx: ComponentContext): UiChild {
    const group = form(ctx, {
      tags: fieldArray<string>({
        initial: ['one', 'two'],
        each: { validate: [required('Every tag needs a name')] }
      })
    });
    built = group as unknown as AnyForm;
    tags = group.fields.tags;
    return Column(
      { gap: 8, padding: 12 },
      // Keyed by the row's own key rather than by its index, which is
      // what keeps the right editor over the right tag when one in the
      // middle goes.
      each(group.fields.tags.rows, 'key', row =>
        createComponent(TextInput, { label: `Tag ${row.key}`, ...row.field.bind() })
      ),
      createComponent(Button, { label: 'Add', onClick: () => group.fields.tags.add('') })
    );
  }

  it('draws a field per row and keeps the keys across a removal', () => {
    const ui = mount(createComponent(Tags, {}));
    const array = tags!;

    expect(ui.getAllByRole('textbox')).toHaveLength(2);
    const keys = array.rows.value.map(row => row.key);

    array.remove(keys[0]);
    ui.frame();

    expect(ui.getAllByRole('textbox')).toHaveLength(1);
    expect(array.rows.value.map(row => row.key)).toEqual([keys[1]]);
    expect(array.value.value).toEqual(['two']);
  });

  it('validates every row, and fails the form when one does', () => {
    const ui = mount(createComponent(Tags, {}));
    const array = tags!;

    array.add('');
    ui.frame();

    expect(built!.valid.value).toBe(false);

    array.touch();
    ui.frame();

    expect(ui.getByText('Every tag needs a name')).toBeDefined();
  });
});

describe('a form is a helper and not a requirement', () => {
  it('leaves a plain controlled TextInput working exactly as it did', () => {
    const value = internalState('held by the app');
    const ui = mount(
      createComponent(TextInput, { label: 'Plain', value, onChange: (next: string) => (value.value = next) })
    );

    ui.fireEvent.focus(ui.getByRole('textbox'));
    ui.fireEvent.type('!');
    ui.frame();

    // The caret starts at the top of the field, so the insertion lands
    // there; what is being checked is that it reached the app's cell.
    expect(value.value).toBe('!held by the app');
    expect(ui.getByRole('textbox')).toHaveSemantics({ role: 'textbox', name: 'Plain' });
  });

  it('shows a description until an error replaces it', () => {
    const ui = mount(
      createComponent(TextInput, { label: 'Handle', description: 'Letters and numbers', error: 'Already taken' })
    );

    expect(ui.queryByText('Letters and numbers')).toBeNull();
    expect(ui.getByText('Already taken')).toBeDefined();
    expect(ui.getSemantics(ui.getByText('Already taken')).live).toBe('polite');
  });
});
