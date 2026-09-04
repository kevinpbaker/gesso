---
description: 'A one-minute decision: the applications Gesso is for, the pages it is not for, and what to use instead of it in each case.'
---

# Is Gesso for your project?

Three questions. If the answers are yes, no, no, Gesso is the right
tool; otherwise something else is, and this page names it.

## Does the interface have work to do while it draws?

Gesso exists for the interface that is busy: an editor diffing a large
document, a console over a live feed, a dashboard that ingests while you
scroll, a simulation stepping under its controls, a tool with a hundred
thousand rows and a filter that narrows them as you type. On the web all
of that shares one thread with layout and paint, and the person watches
them take turns. Gesso puts the interface on a render worker and the
application on a worker of its own, so nothing you compute can delay a
frame or a keystroke. That is measured, not claimed: in
`decisions/0030-thread-model.md` the main thread was busy-looped for five
seconds with a click delivered during it, and the render worker's worst
frame gap did not move.

If your screen is mostly still, with occasional interaction, the single
thread was never your problem. The DOM is the better tool there and this
page will not argue otherwise.

## Is the screen a document?

A canvas has nothing for a crawler to read, nothing to select with the
browser's own selection, nothing for `view source`, `Ctrl+P` or a browser
extension, and it needs JavaScript to show anything at all. If the value
of your screen is being indexed and linked, an article, a marketing
page, documentation, a storefront's product pages, use the DOM. This
documentation site is HTML with Gesso embedded in it for exactly that
reason.

## Does it need to feel like the platform's forms?

Native inputs bring autofill, password managers, the mobile keyboard
that matches the field, and years of accessibility work. Gesso's inputs
are good: they edit, compose through the IME, select, find, and are
announced to a screen reader with the right role and name. They are not
the platform's, and a sign-up form is better served by the platform's.

## Where it is at home

- **Desktop-class tools in a webview.** An Electrobun or Electron-style
  window is a webview, and a Gesso application inside one is the whole
  window: its own layout, its own text, its own controls, with the
  application logic on a thread the window never waits for. This is the
  target `docs/ROADMAP.md` names as the endgame and `NATIVE_ROADMAP.md`
  argues for.
- **Dashboards and consoles over live data.** Tens of events a second
  indexed on the application worker while the render worker scrolls a
  virtualised list and draws a filter narrowing as it is typed. The
  flagship, a firehose reader over Bluesky and Wikimedia, is this.
- **Editors and simulations.** Anything where the work is the point and
  the frames must not know about it.

## What to use instead

| If your project is                         | Use                                    | Because                                                                   |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| A content site, a blog, documentation      | Astro, Next.js, or plain HTML          | Its value is being indexed, and the DOM is what crawlers and readers read |
| A form-heavy product page                  | React, Solid, Svelte or Vue on the DOM | Native inputs, autofill and the platform's keyboards                      |
| One codebase for mobile and web            | Flutter                                | Gesso runs in a browser or a webview; it has no mobile runtime            |
| A screen that must work without JavaScript | Server-rendered HTML                   | A canvas is script or nothing                                             |
| A busy application with its own interface  | Gesso                                  | The interface never shares a thread with the work                         |

## What is proven, and what is not

Every claim on the [landing page](/) is produced by a script in the
repository, and the table there links each figure to its script. The
honest limits are on [What Gesso is](/guide/what-is-gesso#before-you-build-on-it):
Chrome is the extent of the evidence, no screen reader has been run
against it, and the three desktop webviews have not run this code. Read
those before you decide, because they are the part a landing page would
leave out.
