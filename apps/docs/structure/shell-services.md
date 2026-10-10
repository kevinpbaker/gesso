---
description: 'ShellService: the clipboard, URLs, files and the appearance signal a component in a render worker reaches through the thread that has a window.'
---

# Shell services

An application in a render worker has no `window`, no `document`, no
`navigator.clipboard` and no `matchMedia`. Everything that needs one of
those has to be asked of the shell, which is the small piece of code on
the main thread that owns the canvas and the worker behind it.

`ShellService` is that seam, as a service a component injects. Requests
go out through it, and the two facts only a thread with a window can
answer come back through it and through `AnimationService`.

<LiveExample id="shellservices" height="320" />

<<< @/src/examples/ShellServicesExample.tsx#shell

Press the button and the request crosses to the main thread, which is
the only thread with a clipboard to write to. The link it carries names
the appearance the shell last reported, which is the shape of this whole
page in one screen: a signal comes in, the application decides what it
means, and a request goes back out.

## Asking the shell for something

`ShellService` has four actions an application calls:

| Action           | What the shell does with it                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `copyText(text)` | Writes the text to the system clipboard through `navigator.clipboard`, or a hidden textarea and `execCommand` where that is refused |
| `openUrl(url)`   | `window.open(url, '_blank', 'noopener,noreferrer')`                                                                                 |
| `openRoute(url)` | Opens the app at one of its own urls somewhere new: the host's `onOpenRoute`, else a tab at the history's address, else in place    |
| `redirect(url)`  | `window.location.assign(url)`, once the url is resolved against the page and its scheme admitted                                    |

`openRoute` is what a Cmd-click on an in-app [Link](/components/link)
sends. Its url is the router's, not an address, and turning it into one
is the shell's job, because only the shell knows whether the app lives
at a path, in a fragment, inside another product or in a desktop
window. [Routing](/structure/routing#links-and-opening-a-screen-somewhere-new)
has the order the shell tries things in.

`openUrl`, `openRoute` and `redirect` return `void`, and nothing comes back. `copyText` returns a
promise of whether the text reached the clipboard, and most callers
ignore it: the text is on its way the moment the call returns, and
nothing waits on the answer unless something asks for it. It is for the
application that tells the person what happened, a "Copied" toast after
a menu command or a shortcut, which would otherwise say so on the
occasions the browser refused. Browsers do refuse: the clipboard wants a
focused document, some want a fresh gesture too, and a key pressed in a
render worker reaches the window's clipboard a message after it reached
the canvas.

```ts
const copied = await shell.copyText(link);
status.value = copied ? 'Copied the link' : "Couldn't copy the link";
```

A runtime with no shell at all answers `false` straight away. Under
`renderTest` a request made before a test installs a listener is held
for the listener, so a component that calls `copyText` in a test does
not need a clipboard to exist; a test that wants the answer settles it
with `runtime.settleClipboard(request.id, true)`.

There is a third request on the same channel, `history`, and no
component issues it: the router turns a navigation into one because the
address bar is on the other thread.

### Leaving the page

`redirect` is the one action that ends the application. `openUrl` puts
a url beside the app, in a tab of its own; the router's `navigate`
moves between screens inside it; `redirect` replaces the page, and
whatever the app held in memory goes with it. That is what a sign-in
against a server needs. A button that sends the page to
`/api/auth/login` hands it to the app's own server, which redirects to
the identity provider, which sends it back signed in, and none of that
can happen in a tab the app opened beside itself or a screen the
router drew. Signing out is the same shape: `/api/auth/logout` clears a
cookie only the server can clear and sends the page home.

```ts
signIn = () => this.shell.redirect('/api/auth/login');
signOut = () => this.shell.redirect('/api/auth/logout');
```

A relative url resolves against the page, so those mean the app's own
origin. It is also where a popup sign-in goes when `openPopup` reports
the popup blocked.

The shell refuses a url whose scheme is not http, https or the page's
own, and warns on the console instead. `location.assign` given a
`javascript:` url does not go anywhere; it runs the script in the page.
A redirect target is often built from data, a `returnTo` from the
address bar or a link from the server, and the check is what keeps such
a url from becoming a way in. The page's own scheme is admitted so that
a window loaded from something other than http, an Electrobun window
on `views://`, can still redirect to a relative url of its own.

`createApp({ onRedirect })` replaces `location.assign` for a host that
wants something else, given the resolved url and only after the scheme
check. A desktop window rarely needs it: the webview navigates the way a
page does, and comes back when the server sends it back.

## What the shell reports

Two preferences travel the other way, and they land in different places
for a reason worth knowing.

| Signal          | Where an application reads it                     | Who consumes it                                       |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `colorScheme`   | `ShellService.colorScheme`, an `Observable`       | Nothing in the framework                              |
| `reducedMotion` | `AnimationService.reducedMotion`, a bindable cell | The animation driver, which snaps instead of tweening |

Reduced motion has a consumer inside the framework, so it is carried to
the thing that consumes it. Appearance has none: no built-in theme
switches on it, and nothing in layout, paint or input reads it. It
reaches `ShellService` and stops.

So the framework reports which appearance the platform is in and decides
nothing about what it looks like. A framework that shipped an answer
would be shipping a palette, and the palette is the application's.

Both signals are sent once at start-up as well as on change. Nobody
fires a change event at an application that started in the appearance it
is already in, so without the first report a person in dark mode watches
a light first frame.

`colorScheme` is read-only to the application: a private cell behind an
`Observable`, plus a `currentColorScheme` getter for code that wants the
answer without subscribing, which is what the click handler above uses.
The shell is the only writer, because a cell the application could also
write is a cell the next media-query change silently overwrites. An
application with its own light, dark and auto control keeps that choice
as application state and combines it with this one; the
[light and dark](/guide/appearance) page has that in three lines, along
with mapping the signal onto a theme.

`reducedMotion` is not read-only, and `AnimationService.applyReducedMotion`
is public for a reason: an application may legitimately offer a motion
setting of its own, and someone who wants less motion in one app should
not have to change an operating-system preference to get it. The last
caller wins, and there is no priority between the platform's answer and
the application's.

## Size, and the device pixel ratio

Neither is a signal an application subscribes to, and there is no
viewport size on `ShellService` or on the component context. A screen
answers a size change through layout instead.

What happens when the window changes:

1. The shell watches the element the application was mounted into with
   a `ResizeObserver` and reads `contentRect`, the logical CSS size.
2. It posts `{ type: 'resize', width, height, dpr }`, with `dpr` taken
   from `window.devicePixelRatio`.
3. The runtime re-lays out the tree against the new logical size, hands
   the ratio to the renderer, which owns the backing store, and repaints
   in the same task rather than on the next tick. Resizing a canvas
   clears it, so a deferred repaint would show one blank frame per
   resize notification, which reads as flicker while dragging.

Two consequences for the code you write. **An application is in logical
pixels throughout**: `padding={16}` is 16 CSS pixels on a laptop screen
and on a 3x phone, and the ratio never reaches a component. And **a
zero-sized report is ignored**, because a hidden or detached host
reports `0x0` and a zero logical size makes the renderer's cull
rectangle empty, which would discard every node in the tree.

The first size is measured from the canvas rather than from the host
element, which matters when the host has padding: `clientWidth` includes
it and the canvas is sized to its content box, so measuring the host
started the runtime with a viewport wider than the surface it draws on.

## Files

A picker, a download and a `FileSystemFileHandle` are all the window's,
so opening and saving files are shell requests too, answered with a
promise the way a popup is:

```ts
const shell = ctx.inject(ShellService);
const CSV = [{ description: 'CSV', mediaType: 'text/csv', extensions: ['.csv'] }];

// In the click handler, before anything slow: a picker needs the gesture.
const opened = await shell.openFiles({ accept: CSV });
if (opened.outcome === 'ok') {
  const [file] = opened.files; // name, mediaType, bytes, handle
}

const saved = await shell.saveFile({ name: 'book.csv', text, mediaType: 'text/csv', accept: CSV });
// saved.saved: { name, handle, via: 'file' | 'download' }
```

| Action                             | What the shell does with it                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `openFiles(options)`               | `showOpenFilePicker`, or a file input where there is no picker; reads each file's bytes       |
| `saveFile(options)`                | writes to `handle` when given (Save); otherwise `showSaveFilePicker` (Save As), or a download |
| `reopenFile(handle)`               | reads a remembered file, asking the browser for permission again if it lapsed                 |
| `recentFiles()`                    | lists the remembered files, most recently used first                                          |
| `forgetFile(handle)`               | stops remembering one                                                                         |
| `openDirectory(options)`           | `showDirectoryPicker`; remembers the folder and reads nothing in it                           |
| `reopenDirectory(handle, options)` | asks the browser again for a remembered folder, in `read` or `readwrite` mode                 |

A handle is a **number**. The `FileSystemFileHandle` behind it is not
plain data and cannot cross the barrier, so the shell keeps it (in
IndexedDB, which can hold one) and hands out its key. That is also
what makes "recent files" work across a reload: the numbers name the
same files tomorrow. What does not survive a reload is the permission,
which the browser asks for again, and asking needs a gesture; so a
`reopenFile` or a `saveFile` to a handle belongs in a click handler as
much as a picker does.

Every answer is one `ShellFileResult`. `cancelled` is a person closing
a picker, which is a decision rather than a failure; `denied` is the
browser refusing, most often for want of a gesture; `unsupported` is a
shell with no way to do it. Where there is no File System Access API,
as in Firefox and Safari, files come back with `handle: null` and a save is
a download, and the answer says so rather than leaving an application
to feature-test for itself. A file read in the worker configuration
arrives with its buffer transferred, not copied.

### Folders

A folder is not read through the shell. An editor, a photo library or
a static site generator opens a folder to read thousands of files from
it, one at a time, and every one of those crossing to the page and back
would be the whole cost. So `openDirectory` answers only a number and
a name, and the thread that does the work takes the handle itself:

```ts
// Render worker, in the click handler:
const { directory } = await shell.openDirectory({ mode: 'readwrite' });
if (directory !== null) files.send.openFolder(directory.handle);

// App worker (or any thread of the page):
import { rememberedDirectory } from 'gesso-framework';
const folder = await rememberedDirectory(handle); // a FileSystemDirectoryHandle, or null
for await (const [name, entry] of folder.entries()) {
  /* ... */
}
```

The handle comes from the IndexedDB store the shell keeps its handles
in, which every thread of an origin shares, and brings the permission
the picker granted. After a reload the permission has to be asked for
again, from a click: `reopenDirectory(handle, { mode })`, and then the
worker can read the folder again. `recentFiles` lists folders too, with
`kind: 'directory'`. Browsers without the File System Access API have
no folder picker, and the answer is `unsupported`.

## The single-thread configuration

Nothing above changes. `GessoApp` registers the same `ShellService`,
performs the requests directly instead of posting them, runs the same
media queries, and observes the same element. A component cannot tell
which configuration it is in, which is the point of routing these
through a service rather than letting a component reach for `window`
when it happens to have one.

## Limits

- Every shell behaviour in this project has been verified in Chrome and
  nowhere else. Neither WKWebView nor WebView2 has seen any of it.
- `openUrl` is not demonstrated by the example above, because a
  documentation page that opened a new tab when you clicked it would
  take you off the page. What a browser shell does with it is the
  `window.open` call in the table. `redirect` is undemonstrated for the
  same reason, more so, and the scheme check is specced rather than
  driven in a browser.
- The clipboard's `execCommand` fallback is in the source and has no
  test and no browser behind it. It is what runs when
  `navigator.clipboard` is missing or its promise rejects, which is a
  path nothing here has driven.
- A request reaches the shell one message after the click that caused
  it, so it arrives outside the transient user activation the click
  created. Whether that matters to a clipboard write is the browser's
  decision, and it is not something this project has measured. Where a
  copy has to be certain, drive it from the shell.

- The file requests have run in Chrome through real handles, a save,
  a tab closed and the file reopened from `recentFiles`, but with the
  two pickers replaced by functions returning Origin Private File
  System handles, since automation cannot click a native dialog.
  Everything past the dialog is the code above.
- The file requests' fallbacks, a file input and a download, are in the
  source and specced against doubles, and no browser without the File
  System Access API has run them.
- A dismissed file input is reported as `cancelled` only where the
  browser fires `cancel` on it. Where it does not, the promise waits,
  as every file input always has.

## Next

[Errors and the overlay](/structure/errors-and-the-overlay): what
happens when the code on the other side of that boundary throws, and how
a failure in a worker reaches the page at all.
