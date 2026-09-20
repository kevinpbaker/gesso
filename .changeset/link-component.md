---
'gesso-components': patch
---

**`Link`, because a link is not a button with different paint.** The
role is the whole point of the component. `role: 'link'` tells an
assistive technology that activating this goes somewhere; `button` says
that something happens here, and a reader who cannot see the coloured
words navigates by that difference. A link navigates, a button acts, so
"Read the docs" and "Release notes" are links, and "Save", "Delete" and
"Sign in" are still `Button`, which has a `plain` variant for the
design that paints them as words in the accent colour.

There is no anchor on a canvas, so following a link is a request to the
shell. Give it an `href` and activating it injects `ShellService` and
calls `openUrl`, which the runtime forwards to whichever host it has:
`GessoApp` opens the tab itself, `WorkerApp` posts it to the main
thread. The component never touches `window`, which is what lets the
same link run in a worker, in an Electrobun shell and in a test. Give
it `onPress` and no `href` and it is the in-app case: route inside the
handler, nothing leaves, and it is still announced as a link. Give it
both and the handler runs first, which is the shape for recording a
click before the tab appears.

`underline` is `always`, `hover` or `none`, drawn with the real
`textDecoration` property rather than a hairline box, and defaulting to
`hover`: prose full of permanently underlined links is hard to read and
a link with no rule at all is hard to find. Reach for `always` inside
running text, where colour alone will not separate a word from the
sentence around it, and `none` for a navigation row that is already
obviously navigation. The resting ink is `controlAccent` and a disabled
link is `controlForegroundDisabled`, both palette names resolved
against your theme. There is no colour prop, here or anywhere else in
the library.

Enter follows the link, and the component binds nothing else, because
Enter is the key that activates an anchor. Space follows it too,
through the runtime's own default for a focused node whose role is
`button` or `link`, and the component leaves that default alone rather
than swallowing a key an assistive technology may be mapping its
activation gesture onto. A disabled link refuses the pointer, refuses
the key, draws no rule and stays focusable, so the keyboard can still
reach it and be told that it is off.

`children` replaces the words the component draws while `label` stays
the accessible name, for the link whose face is a glyph or a row of its
own. Nothing on a link is read once: `underline` included, every prop
follows a cell as it changes, so you never need to change a link's
`key` to change how it looks.
