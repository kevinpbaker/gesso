---
description: 'Translating an application: ICU messages in typed catalogs, a language that changes while the app runs, numbers and dates the way each language writes them, and the built-in components in the same language.'
---

# Translating

An application's words live in catalogs, one per language, and the
screen shows them in the person's language. The language can change
while the app runs: every string on screen re-formats where it stands,
and nothing remounts. Numbers, money and dates follow the language too,
and so do the words the built-in components say on their own.

Everything here runs on the render worker, beside the text it becomes.

## Catalogs

A catalog maps message ids to [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
strings. The source catalog, usually English, declares every id:

```ts
// messages/en.ts
import { defineMessages } from 'gesso-framework';

export const en = defineMessages({
  'cart.items': '{count, plural, =0 {Your cart is empty} one {# item} other {# items}}',
  'cart.total': 'Total: {total, number, ::currency/CAD}',
  'order.placed': 'Placed on {when, date, medium}',
  greeting: 'Hello, {name}'
});
```

`defineMessages` compiles each message as the module loads, so a
broken message fails where it is written, not when a screen first
shows it.

Every other language has the same ids, and the source's type says so:

```ts
// messages/fr.ts
import type { Translations } from 'gesso-framework';
import type { en } from './en';

export const fr = {
  'cart.items': '{count, plural, =0 {Votre panier est vide} one {# article} other {# articles}}',
  'cart.total': 'Total : {total, number, ::currency/CAD}',
  'order.placed': 'Passée le {when, date, medium}',
  greeting: 'Bonjour, {name}'
} satisfies Translations<typeof en>;
```

An id added to the source and not yet translated is a type error in
every language that lacks it. A language that is translated a piece at
a time is typed `Partial<Translations<typeof en>>`, and its missing ids
show the source.

Catalogs are plain ICU strings in plain objects, so translation tools
that read and write ICU JSON (Crowdin, Lokalise, Phrase and others) can
work with them directly.

## What a message can say

| Syntax                                    | Says                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| `{name}`                                  | the argument as it is                                 |
| `{n, plural, =0 {…} one {…} other {…}}`   | a case by count, with `#` for the number              |
| `{n, selectordinal, one {#st} other {…}}` | a case by ordinal: 1st, 2nd, 3rd                      |
| `{role, select, admin {…} other {…}}`     | a case by value                                       |
| `{n, number}`                             | a number: `1,234.5` in English, `1 234,5` in French   |
| `{n, number, integer}` / `percent`        | rounded, or as a percentage                           |
| `{n, number, ::currency/CAD}`             | money; also `::compact-short`, `::.00`, `::group-off` |
| `{d, date, medium}` / `{d, time, short}`  | a date or a time: `short`, `medium`, `long` or `full` |
| `'{'` and `''`                            | a literal brace, and a literal apostrophe             |

Plural categories come from the platform's `Intl.PluralRules`, so
Arabic's six forms and Russian's three need nothing extra. `=0` is
matched before the category.

What is not supported is refused when the message compiles, with the
message and the place: `offset:` in a plural, `spellout`, `duration`
and number patterns (use a skeleton after `::` instead).

A date given as `YYYY-MM-DD` is a calendar day, not an instant. It is
formatted in UTC so it shows as the same day wherever the person is.

## Putting it on screen

`createI18n` takes the catalogs, and the root provides the result to
everything under it:

```tsx
// app.render.worker.ts
import { createI18n, provideI18n } from 'gesso-framework';
import { en } from './messages/en';
import { fr } from './messages/fr';

const i18n = createI18n({
  source: en,
  locales: {
    fr,
    ar: () => import('./messages/ar').then(module => module.ar)
  }
});

function App(_inputs: unknown, ctx: ComponentContext) {
  return (
    <column provide={[provideI18n(i18n)]} textDirection={i18n.direction}>
      <Shop />
    </column>
  );
}
```

A component reads it with `i18nFrom(ctx)`:

```tsx
function CartSummary(_inputs: unknown, ctx: ComponentContext) {
  const t = i18nFrom(ctx);
  const cart = ctx.channel(Cart);

  return (
    <column gap={4}>
      <text text={t.message('cart.items', { count: cart.view.count })} />
      <text text={t.message('cart.total', { total: cart.view.total })} />
    </column>
  );
}
```

`message` returns a cell. Components run once, so a string that has
to change is a cell the text is bound to. An argument given as a cell,
such as a channel's view key, is followed, so the text re-formats as
the count changes. The ids are typed from the source catalog, so a
misspelled id is a type error.

The other formatters return cells too:

| Method                                      | Gives                                             |
| ------------------------------------------- | ------------------------------------------------- |
| `t.number(value, Intl.NumberFormatOptions)` | `$1,234.50`, `1 234,50 $`                         |
| `t.date(value, Intl.DateTimeFormatOptions)` | `Nov 27, 2026`, `27 nov. 2026`                    |
| `t.list(['Ada', 'Ben', 'Cy'])`              | `Ada, Ben and Cy`, `Ada, Ben et Cy`               |
| `t.relativeTime(-1, 'day')`                 | `yesterday`, `hier`                               |
| `t.format(id, values)`                      | a string now, for a string that leaves the screen |

## Which language

At start, `createI18n` takes the first of the person's languages
(`navigator.languages`, which a worker has) that a catalog covers,
falling back one subtag at a time. It keeps the person's own tag: a
person whose language is `en-CA` reads the `en` catalog and sees
Canadian dates. If no catalog matches, it uses the source's language.
While the application has not chosen a language, it follows the
platform's `languagechange` event.

`locale` in the options picks the starting language yourself.

### Switching while the app runs

```ts
await i18n.setLocale('fr-CA');
```

The new language's catalogs load first, by `import()` where a loader
is given. The language on screen stays until they arrive, so nothing
flashes in the source language on the way. Then every bound string
re-formats in one frame. `i18n.loading` holds the language being
loaded, for a spinner on the picker. A catalog that fails to load
rejects the promise and leaves the old language on screen.

A language given as an object is on screen at once. Give the language
a person is most likely to start in as an object, and the rest as
loaders, so the first frame is already in their language.

### Lookup order

For `fr-CA`, an id is looked up in the `fr-CA` catalog, then `fr`,
then the source. A message that falls back to the source is formatted
by the source language's rules, so a French screen still reads
"0 items" and not "0 item". Each missing id is reported once to
`onMissing`, which is `console.warn` by default.

## Right to left

`i18n.direction` is `'ltr'` or `'rtl'` for the language on screen.
Bound to the root's `textDirection`, as in the example above, it
mirrors the app when the language changes to Arabic or Hebrew. Text
shaping and bidi were already there. This only sets which way the root
reads. How far each layout and overlay mirrors is the engine's
existing behavior, described in [Right to left](/layout/right-to-left).

## The built-in components

The components in `gesso-components` say some words on their own:
`Dismiss` on an alert, `Close` on a drawer, Copy and Paste in the
context menu, `Previous page`, `No matches`, `Play` and `Pause`. They
read them from the `I18n` they are placed under. With none provided,
they say them in English, so an app that never translates sees no
change.

`componentMessages` is the English catalog of those words, with ids
under `gesso.`. Translate it like any other catalog and give it as
`components`:

```ts
import type { ComponentMessages } from 'gesso-components';

const componentsFr = {
  'gesso.dismiss': 'Ignorer',
  'gesso.close': 'Fermer',
  'gesso.pagination.previous': 'Page précédente'
  // …
} satisfies Partial<Translations<ComponentMessages>>;

createI18n({ source: en, locales: { fr }, components: { fr: componentsFr } });
```

A word that a component takes as an input, such as `Pagination`'s
`label` or `Tour`'s `doneLabel`, is still yours to give, and what you
give wins. `DatePicker` names its days and months in the language of
the `I18n` it is placed under, unless its `locale` input says
otherwise.

Gesso ships the English catalog only.

## Messages from the data layer

The application worker names messages. It does not word them:

```ts
// the view key holds plain data, which crosses the barrier
view: { problem: { id: 'save.failed', values: { name: 'Q3 budget' } } }
```

```tsx
<text text={t.text(store.view.problem)} />
```

So a language switch re-formats on the render worker and sends
nothing across the barrier, and an AI agent reading the channel reads
the same data whatever language the person reads.

For the rare string that the data layer must word itself, such as an
export or a notification, `gesso-framework/worker` has
`formatMessage(catalog, id, values, locale)` and the same
`defineMessages`. It does not have `I18n`, which belongs to the screen.

## Limits

- **ICU, not all of it.** No `offset:`, no `spellout` or `duration`,
  and number skeletons only as listed above.
- **Argument types are not checked.** A message's ids are typed, but
  its arguments are a record of values. A missing argument shows as
  `{name}` and is reported once.
- **`DatePicker` reads the language when it mounts.** Its other words
  change live, but its month and day names change when it is next
  mounted.
- **No line-breaking by language yet.** Line breaks follow the text's
  script and not the catalog's language. A locale-aware break for
  Japanese and Chinese is not built.
- **Checked in node only.** The specs format en, en-CA, fr, fr-CA, ar,
  he and ru with node's ICU data. Browsers carry their own ICU, and a
  browser with less locale data can format some languages differently.
