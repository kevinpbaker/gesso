---
description: The Gesso panel in Chrome devtools, and the same panel as a pane in your page. The node tree, a node's report, the workers' consoles, the frame profiler and the action log in one place.
---

# The devtools panel

The other four tools mount over the canvas, in a corner, because they
must not change the size of the thing they describe. That rules out the
one view a DOM developer reaches for first: a tree of everything on the
screen, docked beside a report on the node you picked from it.

The devtools panel is that view. It lives outside the page, so it can be
as tall as it likes and take the pointer, and it shows five things:

| Tab      | What it shows                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree     | Every node, with the component that rendered it and a text node's text. Hover to outline a node on the canvas; click to select it.                                                            |
| (report) | The selected node's `UiNodeReport`, kept fresh as the node changes: props with their sources, what it listens for, what it covers at the pointer, its environment and its layout explanation. |
| Console  | `console.*` from the render worker and the application worker in one log, with the thread named, and every error the shell heard.                                                             |
| Frames   | The frame profiler, docked.                                                                                                                                                                   |
| Actions  | The store action log's commands and patches, when the application connected one.                                                                                                              |

The "Inspect layout" toggle turns the layout inspector on from the
panel. With it on, hovering the canvas reveals the node under the
pointer in the tree.

## What the page does

One call, after the application is created:

<<< @/src/examples/DevtoolsSetup.ts#connect

`connectDevtools` registers the application with a hook kept on the
window, and installs the transport an extension reaches the page
through. Several applications on one page share the hook and a panel
sees them as a list. Call the function it returns when the application
is disposed.

It takes the application's devtools listener over. The events only
exist for panels, so nothing an application would do with them is
lost.

## In Chrome

The extension is in the repository at `apps/devtools-extension`. Build
it and load the `dist` folder unpacked from `chrome://extensions` with
developer mode on. Reload any tab that was open before you installed it;
Chrome does not inject a content script into a page that loaded first.
Open devtools on a page that called `connectDevtools` and choose the
Gesso tab.

The extension is wire and nothing else: a content script that reaches
the page over `window.postMessage`, a background service worker that
pairs each tab with the panels inspecting it, and a devtools page that
adds the tab. The panel itself is the one exported from this package.

## In your own page

The same panel mounts anywhere, over a port. This is how the playground
shows it in a pane under the preview, and how a page without the
extension can still have it:

```ts
import { createDirectPorts, getDevtoolsHook, mountDevtoolsPanel } from '@gesso/devtools';

const { page, panel } = createDirectPorts();
const detach = getDevtoolsHook().attach(page);
const mounted = mountDevtoolsPanel(paneElement, panel);
// Later:
mounted.dispose();
detach();
```

The panel has no idea which of the two it is in, which is what
guarantees they show the same thing.

## How it reaches the tree

Everything the panel shows is built where the tree is, in the render
worker, and crosses as plain data. `DevtoolsRequest` and `DevtoolsEvent`
in `@gesso/framework` are the vocabulary: a panel asks for the tree, a
node's report, an outline, frames or the consoles, and the runtime
answers and keeps answering while something is watched. A worker shell
carries them over the render worker protocol; a same-thread shell
answers them directly. The panel cannot tell which.

Node ids are positional, so a selection in the tree follows a position
rather than an identity. A list that reorders under a selected row can
put a different node there; the report says what the node is now.

## What it does not do

It reads. Nothing in the panel edits a property, sends a command or
rewinds the store. The action log's time travel is in the in-page panel
and not here, because time travel moves the view from where the ports
are, and the ports are in the page.

With the runtime on the main thread the Console tab is empty: the page's
console already has everything, and there is no hidden thread to
forward.
