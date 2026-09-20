---
description: Forms in Gesso, the form group, validators that compose, field arrays, and what happens while a check is still being answered.
---

# Forms

A form is three problems, and only the first is about controls. The
second is knowing that six fields exist, that two of them are wrong,
that nobody has been near the third yet, and which one the caret should
go to when the button is pressed. The third is saying all of that out
loud, so a person who cannot see the red border still learns what
happened.

`gesso-components` answers the first with its controls and the other
two with `form`.

<LiveExample id="form" height="340" />

<<< @/src/examples/FormExample.tsx#form

Press Continue with the form empty: nothing is sent, the caret lands in
the email field, and each rule that failed says so under its control. A
screen reader hears the messages as they appear, because each one is a
live region, and hears the field's message again after its name when
focus arrives.

## A form is a helper, not a requirement

Nothing in Gesso needs a form group. A control given `value` and
`onChange` is complete on its own, it is what every page in
[Using components](/guide/using-components) shows, and a screen with two
fields and no rules is better written without a group at all:

```tsx
<TextInput label="Filter" value={filter} onChange={next => (filter.value = next)} />
```

Reach for `form` when there are rules, a submit, or a message to place.

## The group

`form(ctx, fields, options)` takes the component's context, because it
does two things a component does: it puts the caret somewhere, and it
follows every field for as long as the screen is up.

```tsx
const signUp = form(
  ctx,
  {
    email: field({ initial: '', validate: [required(), email()] }),
    handle: field({ initial: '', validate: [required(), minLength(3)] })
  },
  { onSubmit: values => account.send.create(values) }
);
```

`signUp.fields` is the object you passed, so `signUp.fields.email` is a
`Field<string>` and `signUp.values` is `{ email: string; handle: string }`.
Nothing is looked up by a string at runtime and nothing is typed twice.

### Binding a field to a control

`bind()` spreads onto a control everything the control needs from the
form: the value, the writer, the message to show, whether the field is
required, and the ref the form focuses when that field is the first one
wrong.

```tsx
<TextInput label="Email" {...signUp.fields.email.bind()} />
<Checkbox label="I accept" {...signUp.fields.terms.bindAs('checked')} />
```

`bindAs` is for a control that calls the value something else. A
`Checkbox` takes `checked`, so `bindAs('checked')` hands it a `checked`
and no `value` it would reject.

### The four cells

| Cell        | True when                                               |
| ----------- | ------------------------------------------------------- |
| `valid`     | every field passes and no form-wide rule found anything |
| `dirty`     | some field differs from the value it started with       |
| `touched`   | somebody has been in a field and left it again          |
| `submitted` | the form has been submitted at least once, valid or not |

They are cells, so bind them:

```tsx
<Button label="Save" disabled={computed(() => !signUp.valid.value)} onClick={() => void signUp.submit()} />
```

A field's message is shown once the field is `touched` or the form is
`submitted`, and not before. Nobody should be told they got it wrong
while they are still typing it for the first time.

### Submit

`submit()` marks every field touched, blocks if anything is wrong,
focuses the first field that failed in declaration order, and otherwise
runs the handler.

It returns a promise, and **it runs the handler in the same task when
nothing is pending.** That is deliberate. A browser grants a popup, a
clipboard write or a file picker only while the gesture that asked for
it is fresh, so a submit that always awaited would quietly break every
handler that opens one. The promise is what to await when a field has an
asynchronous check in flight, and then the form waits for the answer
before deciding.

## Validators

A validator is a function from a value to a message or `null`. That is
the whole interface, so writing one is a line:

```ts
const noSpaces: Validator<string> = value => (value.includes(' ') ? 'Spaces are not allowed' : null);
```

The library ships the handful every form needs. Each takes the message
to show, so the words on the screen are yours:

| Validator                | Fails when                                                  |
| ------------------------ | ----------------------------------------------------------- |
| `required(message?)`     | the value is blank, empty, `NaN`, an empty list, or `false` |
| `minLength(n, message?)` | a string or list is shorter than `n`                        |
| `maxLength(n, message?)` | a string or list is longer than `n`                         |
| `pattern(re, message?)`  | a non-empty value does not match                            |
| `email(message?)`        | a non-empty value does not look like an address             |
| `range(min, max, m?)`    | a number is outside the range                               |
| `allOf(...checks)`       | any of them does; the first message wins                    |

A field runs its checks in order and shows the first message it gets, so
put the cheap and general ones first. `required` is the exception worth
knowing about: a field whose checks include it reports itself required
to an assistive technology, so the rule is written once rather than as a
validator and a prop.

`pattern` and the checks built on it pass an empty value on purpose.
`pattern` says what a value must look like and `required` says whether
there has to be one, which is what makes a field that is optional but
must be well formed take two checks and no third.

## Checks across the whole form

A rule that reads two fields belongs to the thing that holds both:

```ts
const signUp = form(ctx, fields, {
  validate: matches('password', 'again', 'The two passwords do not match')
});
```

A form validator answers `Problems`: a message per field name, and one
for the form itself when the problem belongs to no single field.

```ts
validate: values => (values.from > values.to ? { fields: { to: 'Before the start date' } } : null);
```

A message addressed to a field appears under that field like any other.
`{ form: '...' }` lands on `group.error`, which is shown once the form
has been submitted and is yours to place.

## A validation library

Gesso depends on no schema library and never will. What it fixes is the
shape an adapter fills in, which is one method:

```ts
const schema: Schema<Values> = {
  check(values) {
    const answer = Account.safeParse(values);
    if (answer.success) {
      return null;
    }
    const fields: Record<string, string> = {};
    for (const issue of answer.error.issues) {
      fields[String(issue.path[0])] ??= issue.message;
    }
    return { fields } as Problems<Values>;
  }
};

const signUp = form(ctx, fields, { schema });
```

A schema runs before the form's own validators and beside each field's
own, so adopting one does not mean giving up the two lines of
`required()` a field already had.

## A check that has to ask something

Whether a handle is taken is not a question a validator can answer on
its own:

```ts
handle: field({
  initial: '',
  validate: [required(), minLength(3)],
  validateAsync: name => api.handleAvailable(name).then(free => (free ? null : 'That handle is taken'))
});
```

The check is a `resource` underneath, keyed on the field's value, so it
reports itself in [the same five words every other request does](/guide/state-and-services):

| Status    | What it means for the field                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `idle`    | there is no asynchronous check, or the field's own checks fail so nothing was asked |
| `loading` | a request is out. The field shows nothing, and the form is **not** valid            |
| `ready`   | the check answered, with or without a message                                       |
| `failed`  | the check could not be made. That counts as invalid, and the reason is shown        |

Three of those rows carry a decision.

**Nothing is shown while it is loading**, because there is nothing to
say yet. What is true is that the form will not go until it hears back:
`valid` is false, so a button bound to it stays disabled, and a press
that gets through anyway is awaited rather than raced.

**A check that could not be made is a failure, not a pass.** A form must
not quietly accept a rule it never managed to apply, so `failed` blocks
and shows the error, and editing the field asks again.

**Nothing is asked while the field's own checks fail.** There is no
point asking a server whether an empty handle is taken, and the key is
`null` until the cheap checks pass, which is exactly `idle`.

`missing` never occurs. A check that answers "no message" has answered.

## A field the application owns

A field is almost never a component's own state. It is the
application's, it lives on a channel, and a channel view key is
read-only with a command beside it. That is two halves of one binding,
and a field says both out loud:

```tsx
const filters = form(ctx, {
  query: field({ value: search.view.query, onChange: search.send.setQuery })
});
```

The form owns nothing here. It reads the key, writes through the
command, and validates a value that lives on another thread exactly as
it validates one of its own. Passing both `value` and `initial` throws
naming the field, for the same reason a control given both `value` and
`defaultValue` does: two owners is a bug rather than a precedence rule
to learn.

## Lists of fields

`fieldArray` is for tags, guests, the lines of an invoice: a list that
grows and shrinks, where each row is an ordinary field.

```tsx
const invoice = form(ctx, {
  lines: fieldArray<string>({ initial: [''], each: { validate: [required('Every line needs a name')] } })
});

<Each of={invoice.fields.lines.rows} key="key">
  {row => <TextInput label="Line" {...row.field.bind()} />}
</Each>;
```

Each row carries a key minted when it was added and never reused, which
is what keeps the right editor over the right row when one in the middle
is removed. `add`, `remove` and `move` are the three things a list of
inputs needs, and a row that fails takes the caret like any other field.

A field array owns its rows. A list that lives on the far side of the
barrier is added to and removed from by commands, and a helper that
pretended to own it would be inventing a second copy of the
application's state to disagree with the first.

## What a message does

A field's message is not only drawn. It is set as the control's
description, so it is read after the name when focus lands on a field
already marked wrong, and the line under the control is a polite live
region, so it is announced when it appears while the person is still
standing in the field. A message that only appears is a message nobody
hears.

That is the whole reason a form belongs in the component library rather
than in each application: the drawing is easy and the announcing is the
part everybody skips.

## Next

[Light and dark](/guide/appearance) is how the theme these controls read
gets into the environment in the first place.
