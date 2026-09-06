---
description: Why a canvas inherits no appearance from the page, how the shell reports light or dark, and how a component follows it.
---

# Light and dark

A Gesso application draws into a canvas, so it inherits nothing from the
page around it: no stylesheet reaches it, and `prefers-color-scheme`
changes no colour it paints. The appearance has to be _told_ to it, and
the shell is the only part of an application with a window to ask.

<LiveExample id="appearance" height="240" />

Use the appearance toggle in this site's navigation bar. The canvas
above follows it, and it is following the page's toggle rather than
your operating system's setting, which is the distinction the API exists
for.

## Reading it in a component

The shell reports the appearance and `ShellService` carries it, as an
Observable a component injects. Every example on this site is mounted
inside the root below. That is why the counter on
[your first component](/guide/counter), which sets no colours at all,
is legible in both appearances:

<<< @/src/examples/ExampleRoot.tsx#theme

`theme` is an environment value: provided at one node and inherited by
everything below it. And because it is an ordinary prop that accepts an
Observable, mapping the scheme onto a theme _is_ the binding. Switching
appearance writes new colours onto the nodes that are already there. No
component function runs again and nothing is rebuilt, which is why a
large screen changes appearance in one frame.

`lightTheme` and `darkTheme` ship with `@gesso/core`. They are a
starting point, not a policy: the framework reports which of the two
appearances the platform is in and has no opinion beyond that, so an
application with its own palette maps the same signal onto that
instead.

This site is one of those applications, which is why the pair above is
`brandLightTheme` and `brandDarkTheme` rather than the two that ship
with the package. They answer the same token names in Gesso's own five
colours, so the canvas on this page is painted out of the same palette
as the prose beside it. A palette is an ordinary value in application
code: `src/examples/brandTheme.ts` is the whole of it, and swapping
which one the line above reaches for is the whole of adopting it.

## Telling the shell what to report

By default a shell follows `prefers-color-scheme` and reports what it
says. A host with a control of its own overrides that:

```ts
const app = createApp({
  renderWorker: () => new Worker(new URL('./app.render.worker.ts', import.meta.url), { type: 'module' }),
  colorScheme: 'dark' // 'auto' (the default), 'light', or 'dark'
});

// …and later, when the reader changes their mind:
app.setColorScheme('light');
```

This page does exactly that: it passes VitePress's current appearance
when the example is created, and calls `setColorScheme` whenever the
toggle moves. Passing it up front rather than correcting it after
mounting is what keeps the first frame from flashing the appearance the
reader did not choose.

`GessoApp` and `createApp(Root)` take the same option and the same
method, so the single-thread configuration behaves identically.

## The other two settings

Light and dark is one axis of an appearance. `UiTheme` carries two
more, and they combine with it rather than forking it:

```ts
const theme = derive([scheme, settings.density, settings.contrast], (dark, density, contrast) => {
  const base = dark ? appDarkTheme : appLightTheme;
  const packed = withDensity(base, density);
  return contrast === 'high' ? withContrast(packed, 'high') : packed;
});
```

`withDensity` scales the spacing scale and nothing else, so a compact
setting tightens every box on the screen and leaves the type alone.
`withContrast` raises every foreground until it clears a 7:1 ratio
against the surface it is drawn on, which is what a person who has
turned the operating system's high contrast setting on is asking for.
Both are described in [themes and the
environment](/appearance/themes-and-the-environment).

Neither is wired to a media query for you, for the reason the section
below gives: which settings an application offers, and where it
remembers them, is the application's.

## An app with its own setting

An application that wants its own light/dark/auto control keeps that
choice as application state, on a channel or in a store like any other
preference that outlives a screen, and combines it with what the shell
reports:

```ts
const scheme = computed(() =>
  settings.appearance.value === 'auto' ? shell.colorScheme.value : settings.appearance.value
);
```

The framework deliberately does not do this for you. Remembering a
person's choice is application state, and where it is stored, whether
that is a file, a database, or `localStorage` behind a shell request, is
the application's decision.
