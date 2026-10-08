# gesso-framework

## 0.6.8

### Patch Changes

- a7bb34e: `ShellService.saveFile` takes `remember: false`, for a file made to keep rather than to open again — an exported picture, a report. It is written where the picker says, as any save is, but does not join the recent files, and its answer has no handle to save back to.
- gesso-core@0.6.8

## 0.6.7

### Patch Changes

- 6493881: An agent that sends a command now gets the view after the command's effect, even when that effect takes longer than `quietMs` to arrive. Before, the call returned as soon as the view had been quiet for `quietMs` (50 ms by default), and a command that waits on a request (a fetch, a subprocess, a database) had usually changed nothing by then, so the agent was handed the view from before its own command and could conclude it had done nothing. Quiet now counts only once the view has changed since the command was sent. The cost is that a command which changes nothing in the view at all now returns at `settleMs` (1000 ms by default) rather than at `quietMs`.
- 4f622ec: Channels can now be served from another process without Electrobun. The bridge that carried a desktop window's channels to and from the main process has moved to `gesso-framework/remote`, under names that say what it is: `createRemoteBridge` in the page and `serveRemoteChannels` in the process that owns the data, with the frame format (`GessoFrame`, `frameData`, `FrameAssembler`, `isGessoFrame`, `DEFAULT_CHUNK_BYTES`) beside them. Neither half knows its transport; each takes a `send` function and has a `receive` method, so a web application whose data lives in a server on the person's machine can carry its channels over a WebSocket. The new page "Channels from another process" shows it end to end.

  `gesso-electrobun` keeps every name it had: `createElectrobunBridge`, `serveChannelsToWindow`, `ChannelHost`, `ElectrobunBridge` and the frame exports are now re-exports of the same code, so a desktop application needs no change.

- gesso-core@0.6.7

## 0.6.6

### Patch Changes

- gesso-core@0.6.6

## 0.6.5

### Patch Changes

- e93e0ee: A `Link` can now name an in-app destination with `to`, and a Cmd-click opens it somewhere new, the way a browser treats an anchor. `to` takes one of the application's own urls (`/epic/BUD-12?story=BUD-13`) or a `RouteTarget` from `to(route, params)`. A plain click, Enter or Space runs `onPress` and then navigates the router in place. A click with Command or Control held (either one, on any platform), a middle click, or Cmd-Enter / Ctrl-Enter runs `onPress` and then asks the shell to open the app at that url somewhere new, leaving the current screen where it is. An `href` link is unchanged: it opens through `openUrl` however it is clicked. When a link has both, `to` wins. `Breadcrumb` items take the same `to`.

  The request is the new `ShellService.openRoute(url)`, and what "somewhere new" means is the shell's decision. `createApp` and `GessoApp` take an `onOpenRoute(url)` for a host with its own idea of a new tab, such as an app inside Jira opening one through Forge's `router.open`. Without one, a browser shell opens a tab at the app's own address for that url: the path on the same origin in `path` mode, the same page with the fragment set in `hash` mode. In `memory` mode there is no address, so the link is followed in place. A handed-in `ShellHistory` can answer the new optional `href(url)` to give the address itself; without it, such a link is also followed in place.

  In `gesso-electrobun`, the view bridge has `openRoute(url)` to pass as `onOpenRoute`, and `createDesktopApp` answers it by opening a new window of the application at that route: `openWindow({ route })`, and an `onOpenRoute(url, window)` option to do something else. A window learns its route from the page it loads: `open` reads `window.route`, `withWindowRoute` puts it in the view url's fragment, and `windowRoute()` reads it back as the window's starting url. An `open` that ignores it keeps working. The Electrobun template does all three.

- gesso-core@0.6.5

## 0.6.4

### Patch Changes

- 2f6a858: The `history` option now also takes a ready-made `ShellHistory`, for an app embedded in a page whose address bar belongs to its host. An app in an iframe inside another product, such as an Atlassian Forge Custom UI app in Jira, can reach the host's address only through a history object the host hands out. Adapt that object to `ShellHistory` and pass it to `createApp`, `createSyncApp(...).useHistory` or `GessoApp` in place of `{ mode }`, and the router reads its starting url from it, pushes and replaces through it, and follows the changes it reports. A history passed in stays the caller's: disposing the app stops listening to it but does not dispose it, so it survives a remount. Options work exactly as before.
- gesso-core@0.6.4

## 0.6.3

### Patch Changes

- An app whose WebGPU device is lost gets a new one and carries on. The fallback it used to take, Canvas2D on the same canvas, could never work: that canvas already holds a WebGPU context, so `getContext('2d')` answers null and the fallback threw on every frame. The runtime now asks the renderer to recover on a new device, and the loss itself requests the frame that starts it. Each renderer listens to its own device's loss rather than to every device on the page. `WebGPURenderer` gains `recover()` and an `onLost` option.
- Updated dependencies
  - gesso-core@0.6.3

## 0.6.2

### Patch Changes

- 0304a05: A canvas the browser empties and hands back is repainted. Chrome reclaims the canvas of a tab left hidden long enough, and a GPU process restart (a Mac waking from sleep) empties every canvas; nothing in the tree had changed, so no frame came and the app sat as a blank rectangle. The runtime now repaints the whole tree on `contextrestored`, and on the way back from hidden for engines that do not fire it. `UiRenderer` gains an optional `surfaceRestored()`, which `Canvas2DRenderer` implements by dropping its scroll layers.
- gesso-core@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [45f3ffe]
  - gesso-core@0.6.1

## 0.6.0

### Minor Changes

- bf21b17: A `Dialog` dims the page behind it, as a browser draws `<dialog>::backdrop`. Palettes have a new `scrim` token, a colour with alpha: the light page's ink at 40% in `lightColors`, black at 60% in `darkColors`, and left alone by high contrast. A custom palette written out in full needs one. Overlay entries take `scrim`, on by default for a `modal` entry and off for every other, so a menu or a list of suggestions never dims the page; the scrim takes its theme from the entry's `environment` and fades in at a dialog's pace, or appears at once under reduced motion. `Dialog` takes `scrim={false}` to leave the page undimmed; its backdrop still keeps the page from presses.
- 684b59a: A `Dialog` that can't be dismissed now keeps the page from presses, as one that can does: every dialog has a backdrop over the whole page, positioned panels with a `zIndex` included, and `dismissible` decides only whether a press or a wheel on it closes the dialog. Before, a dialog with `dismissible={false}` had no backdrop, so a press beside it reached a button in the page under the modal. Overlay entries take a new `modal` option for the same backdrop.
- b085707: `ShellService.redirect(url)` sends the page to a url, leaving the app: what a full-page sign-in or sign-out needs, which a component in a worker could not do. Relative urls resolve against the page, only `http:`, `https:` or the page's own scheme are followed (a `javascript:`, `data:` or `blob:` url is refused with a warning), and `createApp({ onRedirect })` lets a host such as a desktop window decide what a redirect means. It differs from the router's `navigate`, which moves within the app.

### Patch Changes

- e9f86a2: An anchored overlay (a tooltip, a menu, a popover) now opens beside where its anchor is drawn when an ancestor of the anchor has a `transform`. A card on a panned and zoomed canvas used to get its tooltip where the card would be at zoom 1 with no pan, often nowhere near it; the anchor is now carried through every ancestor's translate, scale and rotation, as well as the scroll offsets it already followed, and an overlay that lives under a transform of its own is placed in that space. The accessibility mirror puts its elements over the same drawn boxes, so a screen reader's outline and touch exploration find the card where it is. A node's own transform still takes no part, so a turning spinner neither shakes its tooltip nor moves its element. `LayoutEngine.screenBox(node)` answers the question for anything else that needs it.
- b0233fa: A channel's `view` lists its declared keys: `Object.keys`, `in` and a spread now see them. With only a `get` trap, walking a view found nothing, and an app that snapshotted one by its keys got an empty object.
- 013e064: `color` cascades, as the property reference always said it did: text that names no colour takes the `color` of the nearest ancestor that set one, unless a nearer `textStyle` brings its own. A theme token travels as a name and is resolved where the text is painted, so `<box theme={darkTheme} color="text">` draws its plain text in the dark palette's `text`, and a card inside it that provides another theme draws in that theme's. Until now a node's own `color` reached nothing below it, and plain text under a dark root drew in the default style's near-black on the dark background. Text that already names a colour or a role is unchanged; text that names neither, under a container that sets a `color`, now takes that colour. Changing a cascaded colour repaints the subtree without laying it out again. `UiEnvironmentKeys.color` is the new key the colour travels on, and an overlay carries it from where it was declared.
- 820aee8: Everything that measures a node against the canvas now takes the `transform` of every ancestor into account, as painting and hit testing always have. Under a panned and zoomed parent (cards on a map inside a "camera" box) several things used to work from where the node would be drawn at zoom 1 with no pan:

  - A press from the accessibility mirror or an automation tool, and Enter or Space on a focused button, now click the centre the node is drawn at rather than a point that could be off the node entirely.
  - A modifier's `layoutBox()` and the box `onLayout` reports are the drawn box, so a slider, split pane or colour picker on a zoomed card turns a press into the right value, and `onLayout` hears when a pan above the node moves it on screen. Its size is the drawn size, so a fraction of it stays a fraction; `flowBox()` keeps the laid-out size, and the motion pivot, `breakpoint`, `sizeContainer` and `publishInset` now read that, so a zoom neither shifts a pivot nor crosses a breakpoint. The new `measureFlow` modifier is `measure` for the laid-out box; a virtual list's reveal and a `DataTable`'s sticky header use it, so they scroll by the right amount under a zoom.
  - The caret rectangle handed to the shell, which positions the hidden text field and the IME candidate window, follows the caret where it is drawn.
  - A press beside the fields of an editing group, a drag across them, and a text selection dragged past the end of a line find the field or line nearest the pointer on screen.
  - The mirror's box for a focused node that is scrolled out of view, and the layout inspector's highlight and heatmap, are drawn over the node where it is.

  `LayoutEngine.screenBox(node, part?)` takes an optional rectangle in the node's own coordinates and answers where that part of it is drawn. `EditingHost` and `SelectionHost` take an optional `screenBox`; a host without one behaves as before. With no transform above a node, every answer is the same as before.

- cc9e62b: The router writes `match` before `url`, so a subscriber to `url` that reads `match` sees the match for the url it was handed, not the previous one.
- Updated dependencies [bf21b17]
- Updated dependencies [3b20918]
- Updated dependencies [e9f86a2]
- Updated dependencies [013e064]
- Updated dependencies [a81d551]
- Updated dependencies [820aee8]
- Updated dependencies [684d68a]
  - gesso-core@0.6.0

## 0.5.1

### Patch Changes

- 77195a4: Two more semantics properties, for a field that opens a list of suggestions. `controls` is a relation, like `activeDescendant`: the node this one shows or changes, such as the list a combobox's field has open, held on the record as that node's id and written by the mirror as `aria-controls` naming its element. `autocomplete` (`'list' | 'inline' | 'both'`, the new `UiAutocomplete`) says what a field offers as it's typed into, written as `aria-autocomplete`. The editing proxy writes both while a field has focus, so `EditingMirrorTarget.describe` takes the controlled element's DOM id after the active descendant's. `Combobox` uses them: its field controls the list while it's open, and its autocomplete is `list`.
- 6b71716: An overlay can open beside a part of its anchor: `anchorRect` on an overlay entry (and on `useOverlay`'s options), and the layout property of the same name, is a rectangle in the anchor's own coordinates that the entry is placed against, with the same flip and shift, and that it follows through scrolling and layout as it follows the anchor. It can be an Observable, so it moves without the entry opening again. `EditingService.caretRectOf(node, offset)` (and `UiEditingController.caretRectOf`) answers for a character other than the caret's, so a list opened by `@` sits under the `@` as the name is typed, and goes to the next line with it when it wraps. A point opened beside the caret stayed behind when the page scrolled.
- 581cf89: An open overlay now follows the theme of the place it was declared. The overlay layer read the theme, text style and content colour once, as the entry opened, so a dialog or menu open when the system turned dark, or when a theme the person chose arrived from another worker a moment after they opened it, stayed in the old theme over a page in the new one until it closed. Underneath, a modifier's `host.environment(key, of?)` and `host.onEnvironment(listener, of?)` can read and follow another node's environment, and an environment provided by a node whose own environment changed in the same frame is rebuilt in that frame.
- Updated dependencies [77195a4]
- Updated dependencies [6b71716]
- Updated dependencies [581cf89]
- Updated dependencies [13c096f]
- Updated dependencies [db7040b]
  - gesso-core@0.5.1

## 0.5.0

### Minor Changes

- 5a27b40: `activeDescendant` names the node that's active while another keeps focus, such as the highlighted option of a combobox whose field holds the caret, or the cell a grid's cursor is on. The semantics record carries it as the node's id, and the accessibility mirror writes `aria-activedescendant` from it, both on the node's element and on the editing proxy while a field has focus. Every mirrored element now has a DOM id for it to point at. The proxy also says `aria-expanded` for a field whose record is expanded or collapsed.
- f265910: An AI agent can drive a web application while it runs in development. `gesso-vite-plugin` serves MCP at `/__gesso/mcp` on the dev server and prints the `claude mcp add` line to connect; the agent then sees every channel the open page can reach, the ones its render worker feeds and the ones its application and channel workers serve, and its commands change the page as a click would. Messages travel down the HMR socket to the page, which answers them against the render worker, which asks each worker behind it over a `gesso:agent` port. A command marked `@confirm` is put to the person with the browser's dialog first. The endpoint refuses requests from browser pages, the newest open tab answers, and `agent: false` turns it off. A build carries none of it.

  `gesso-framework/agent` gains what the bridge is made of: `serveAgentPort`, `remoteSurface` and `combineSurfaces` for a surface across threads, `connectDevAgent` for the page's half, and `AgentSurfaceLike` for a surface whose answers are promises, which `handleMcpMessage` and `mcpHandler` now accept. `WorkerApp.openRenderPort(key)` opens a port to the render worker. The scaffolded `AGENTS.md` says how to connect.

- d36a2fa: `gesso-framework/agent` hands an application to an AI agent. `agentSurface(channels)` takes the same `{ token, source }` registrations an application already serves and offers each channel as a resource holding its view, a read-only `<channel>_view` tool, and a `<channel>_<command>` tool per command that sends it and returns the view once it has settled. Tool descriptions, input schemas and hints come from the schema `gesso-vite-plugin` writes from the contract's JSDoc; arguments that do not fit are refused with a sentence naming the field, `@hidden` commands are not offered, and `@confirm` commands are sent only once the `confirm` option says the person approved.

  `mcpHandler(surface)` serves it over MCP's Streamable HTTP transport as a `fetch` handler, ready for `Bun.serve`, refusing unknown browser origins and optionally requiring a bearer token. `handleMcpMessage` is the same server without the transport, for stdio or a relay.

- c38f97e: A single-thread app can be driven by an AI agent too. `createSyncApp(...)` builders now answer `openRenderPort('gesso:agent')` from the page, with the channels fed there, whatever their channel workers serve, and the screen tools, so the dev server endpoint and WebMCP work exactly as they do for `createApp`. `useWebMcp(true | false | { confirm })` is the builder's form of `createApp({ webmcp })`. In a dev server, `gesso-vite-plugin` now hands a `createSyncApp` builder to the agent bridge and turns WebMCP on unless the app's own `useWebMcp(false)` says otherwise. The screen tools run a pending frame after each action on the main thread as they do in the render worker, so a background tab still reports what changed. `serveApplicationAgent` in `gesso-framework/agent` is the assembly both configurations share.
- b90ecb2: An agent can operate the interface, not only the channels. Beside the channel tools, the page now offers `ui_snapshot`, the screen as an outline of what a screen reader announces with a short ref per control, and `ui_press`, `ui_type`, `ui_focus` and `ui_key`, which act on a control named by ref or by role and name and answer with the outline afterwards. They go through the accessibility mirror's own path, so a press is a click, a value is a keyboard edit, a disabled control refuses, and a focus trap holds. Available in the dev server endpoint and through WebMCP. `GessoRuntime.focusedNodeId()` reports which node holds focus.

  The dev bridge also announces the page again whenever its HMR socket reconnects, so a restarted dev server no longer tells an agent that no page is open while one is.

- 96f4bdc: A channel can describe itself. `describeChannel(token, schema)` attaches a JSON Schema of the channel's view and of each command, and `channelSchema(token)` reads it back, so anything that meets an application only at run time can ask a channel what it holds and what its commands take: an AI agent being handed the channel as tools, a devtools panel, a test that drives an app by its commands.

  `gesso-vite-plugin` writes the schema for you. It reads each contract with TypeScript 7's checker and takes the descriptions from the JSDoc you already wrote: on the token, on each view key, on each command, and `@param` for its parameters. Four tags annotate a command for an agent: `@destructive`, `@idempotent`, `@confirm` and `@hidden`. A value that cannot cross a channel, such as a `Date`, a `Map` or an untyped `[]`, is reported as a build warning naming its path. The plugin needs `typescript` 7 or later installed, says so once if it is not, and `channelSchemas: false` turns the whole thing off.

- 88d93b3: A command may carry bytes. An `ArrayBuffer` or a typed array in a command's parameters is no longer reported as unable to cross a channel, because a command's argument is structured-cloned and bytes clone as themselves; a file can be sent as its bytes, with no base64 pass on the render thread. The schema describes such a field as a base64 string tagged `x-gesso-binary` with the type it becomes, and the agent surface decodes an agent's base64 back into that type before the command is sent. Bytes in a view key are still a warning, since a view is diffed.
- dc7f199: `ShellService.copyText` now returns a promise of whether the text reached the clipboard, so an application that says "Copied" after a command or a shortcut can say so only when it's true. Callers that ignore it are unaffected. The `clipboard` request carries an `id`, the shell answers it with a `clipboardResult` message, `GessoRuntime.settleClipboard` settles it, and `writeClipboard` resolves `false` when both the async clipboard and the `execCommand` fallback refuse. A runtime with no shell answers `false` at once.
- 8fb3607: A `current` semantic state, mirrored as `aria-current`, for the current item of a set such as the navigation link to the open page. `selected` was the only way to say it, and on a link or a button a screen reader ignores `aria-selected`, so which page was open went unsaid.

  `Pagination` marks the page you're on `current` instead of `selected`.

- 53b4c46: A copy can put HTML on the clipboard beside the text. An editing group's new `copyHtml(start, end)` gives it, for a selection across fields or inside one field of the group, and `EditingState.html` carries it to the shell, whose copy and cut set `text/html` as well as `text/plain`. A rich editor's copy into a document or an email keeps its formatting. What a group makes of a selection is kept until the selection or its text changes, so `copyText` and `copyHtml` are no longer asked every frame.
- f0ade22: Editables can select as one. Set `editingGroup` on a container and a selection can start in one field and end in another: arrows move between fields at their edges (up and down keep the column), Shift extends across them, a drag or a Shift and press reaches into other fields, and select all takes the whole group. Every field in the range draws its part. Typing, deleting, Enter, paste and cut over such a selection go to the group's `onEdit` with both ends, since only the application knows how its blocks join, and copy and cut take the whole selection, as the group's `copyText` if it gives one.
- 29a36ac: `EditingService.select(anchor, focus)` sets a selection from code, in one field or across the fields of an editing group, and focuses the field its focus end is in. An editor needs it to leave a selection selected after a command over it, since its fields can only select their own text.
- fac08c0: Focus from code can leave the page where it is, as `element.focus({ preventScroll: true })` does: `autoFocus({ preventScroll: true })`, `FocusService.focus(node, { preventScroll: true })` and `UiFocusManager.focus(node, source, { preventScroll: true })`. For focus placed for a screen reader, such as a page's content region focused as it opens, which a reveal scrolled to a few pixels short of its own top. The options reach `onFocusChange` listeners as a third argument, and a key pressed later that makes the focus visible doesn't scroll to it either. The default is unchanged.
- 979053a: A layout listener that changes layout is painted on the same frame. `breakpoint`, `sizeContainer` (and so `Responsive`), `autoFocus` and anything else on `host.onLayout` hear a box after layout, and what they wrote used to be laid out on the next frame, so a page whose breakpoint gave it wide padding was drawn with its narrow padding first and jumped. The runtime now lays out again before it paints, as a browser does after a `ResizeObserver` callback: only what the listeners dirtied, telling only the listeners whose boxes then changed, until they write nothing more that lays out. The loop is bounded at 8 layout passes a frame; past it the frame paints what it has and a warning says so once. A frame whose listeners write nothing that lays out runs one pass. A scroll into view asked for while the listeners run (an `autoFocus` revealing its node) waits until the boxes are final. `FrameMetrics.layoutPasses` counts the passes, and `measured` and `relayoutRoots` count every pass. A geometry `sharedElement` morph lands on the frame of the change instead of being covered by a transform for one frame. `UiScheduler.recollect`, `UiFrame.merged` and `DirtyNodeSet.anyFlags` are what the runtime builds this from.
- 99538fa: A `multiselectable` semantic state, mirrored as `aria-multiselectable`. A list whose rows are selected as a set had no way to say so, and Chrome took the option under its active descendant to be the selected one: a screen reader announced a row as selected that wasn't.
- 28f5b72: `createApp({ pageKeys: true })` says the application is the page: a key pressed while nothing on the page has focus goes to the app, and the canvas takes focus. Keys only reached the app through its canvas, so a page that loads with focus on its body ignored every shortcut until the first click. The templates `create-gesso-app` writes turn it on; an app embedded in a larger page leaves it off.
- b7c9514: A paste carries the clipboard's HTML along with its text. The shell read only the plain text, so a copy from a web page or a document arrived without its headings, lists and links. `UiBeforeInputEvent`, `UiPasteEvent` and an editing group's edit now have `html` (null when the clipboard had none); the field still inserts the plain text, and an editor that keeps structure can cancel that and convert the HTML. `fireEvent.paste` takes the HTML as a second argument.
- 68b01e0: `ScrollService.scrollIntoView(node, padding?)` scrolls the containers above a node until it's in view, for a component whose highlight moves without focus: a combobox walking its list while the caret stays in the field, a grid's cursor. Focus moved from the keyboard already did this; a highlight had no way to.
- 62883e0: `ShellService.contrast` reports the platform's contrast preference: `high` while the person has asked for more contrast (`prefers-contrast: more`) or turned on forced colours (Windows' contrast themes, which a canvas doesn't get from the browser), `standard` otherwise. Reported once at start and on every change, by both the worker and the single-thread shell. `withContrast(theme, contrast)` is the theme that answers it.
- f02740f: A tooltip opens for focus the keyboard can see and not for the focus a press gives, so clicking a button no longer leaves its tooltip over whatever the click opened. A tooltip whose element is removed closes with it, even while the component that rendered the element stays, as when a Run button turns into Cancel. The `Tooltip` component now follows keyboard focus anywhere inside its wrapper, which it could not before because a focus event does not bubble. `FocusService.focusVisible` says whether the focus held is focus the keyboard can see.
- cf3b16a: `createApp({ webmcp: true })` offers an application's channels to an AI agent in the browser through WebMCP. Once the app mounts, every tool the agent surface offers, a view tool per channel and a tool per command, is registered with `document.modelContext.registerTool` (or the older `navigator.modelContext`), and removed when the app is disposed. View tools carry `readOnlyHint`, `@destructive` commands carry `consequentialHint`, a call answers with the view it left or rejects with the sentence that says why, and a `@confirm` command is put to the person with `window.confirm` unless `webmcp: { confirm }` supplies the application's own dialog. In a browser without WebMCP nothing is registered and nothing fails. The code loads on demand, so the shell is no bigger for an app that does not ask.

  `gesso-framework/agent` adds `registerWebMcpTools`, `connectWebMcp`, `pageModelContext` and `confirmInWindow`. `gesso-vite-plugin` turns `webmcp` on in a dev server; the app's own setting still decides.

### Patch Changes

- 8c1b8ed: `FrameMetrics.measured` and `relayoutRoots` are 0 for a frame that ran no layout. They used to repeat the last layout pass's numbers, so a caret blink or a scroll looked like a full re-measure to every profiler and proof panel that reads them.
- 2bfedcd: A component no longer receives the same input value again when its parent re-renders. A prop built as a new Observable in the parent's render re-subscribed and replayed its current value, which re-ran every binding derived from that input even though nothing had changed. In a 2,868-block editor, inserting one block re-measured 12,912 nodes; it now re-measures 488. A changed value, or a new object, still arrives as before.
- 1dfb6c2: The accessibility mirror can no longer be scrolled by the browser. A browser scrolls even an `overflow: hidden` box to bring something into view, as Tab focus, a screen reader or an automation tool does, and a region whose content reached past its box was left scrolled. Every element in it was then described tens of pixels from where it is drawn, so activating one by position activated its neighbour. The mirror now uses `overflow: clip`, which cannot be scrolled.
- fb2a6d8: A precision device's wheel steps are paced over frames. A trackpad sends on its own clock, so a frame got one, two or three of its steps and a steady flick moved unevenly; the runtime now moves each frame by the rate the steps have been arriving at, never more than a frame behind, and applies the rest when the input stops. `UiWheelController` takes a `pace` option and an `advance()` a host calls once a frame; the runtime turns it on.
- 0bef08b: A precision device's scroll is predicted to the frame rather than paced behind it. Each frame puts the page where the input will have reached when the frame is shown, from the steps' velocity and their timestamps, which the shells now pass with each wheel event; the page stays as even as pacing made it without trailing the hand by a frame. `UiWheelController.wheel` takes the event's time, and `advance` the frame's.
- af33f45: `formatUrl` leaves `,` `:` `@` and `/` unencoded in a query, so a list of values reads as written (`?status=todo,done`, not `?status=todo%2Cdone`). What would change how the query parses (`&`, `=`, `+`, `#`) is still encoded, and `parseUrl` reads both forms the same.
- 93d580b: `router.params(route)`, `router.observeParams(route)` and `router.isActive(route)` now recognise a route by its path as well as by identity. Under Vite's dev server, a route table that imports its screens, with screens that import the table, could load twice after a hot edit. The screens then held route objects the router had never seen, and every param read `null`, so a page for one team silently showed the default team.
- 5d67836: The runtime keeps the accessibility tree as records by id plus each record's children in order, and works out a record's index only when it sends that record or the tree is asked for. A structural change used to renumber every record after it and rebuild the whole tree's order, a pass over the whole document on every Enter in a long editor. An Enter in a 5,000-line document now spends about 3 ms on semantics where it spent 7 to 10. The structural rebuild goes through `rewalkSemantics`, and `SemanticsMemory` is what each walk leaves for the next.
- acad77f: Finding the accessibility boxes that moved after a layout now walks only what is on screen. It used to work out every mirrored node's box to learn whether it was visible, which cost a keystroke in a 5,000-line document 4 to 24 ms. Subtrees whose bounds are off screen are passed over whole.
- 444371c: A change in the shape of the tree no longer rebuilds the whole accessibility tree, and no longer sends every later sibling an update. The tree is rebuilt from the nearest record above the change, and anything inside it that nothing touched is taken back as it was: renumbered if it moved, never described again, and a transparent subtree (a block of a long document) taken back as a run without being walked. Updates that only renumber a record whose siblings kept their order are no longer sent, since a mirror that applies removals and adds in order already has it in place: inserting a paragraph in a 5,000-line document sent 4,266 patches to the main thread, and now sends 2. `diffSemantics` gains a companion, `dropIndexShifts`.
- 5b59d13: Every wheel step between two frames counts. Each was added to the offset the last layout settled on, so when a device sent faster than the display drew, as a trackpad does, each step overwrote the one before and a flick moved about half as far as it should, unevenly. A scroll now starts from where the container is going, clamped to its range.
- Updated dependencies [5a27b40]
- Updated dependencies [8d25c04]
- Updated dependencies [20ac739]
- Updated dependencies [303e85a]
- Updated dependencies [0f02fc2]
- Updated dependencies [8fb3607]
- Updated dependencies [4450c5c]
- Updated dependencies [53b4c46]
- Updated dependencies [d356006]
- Updated dependencies [101ea8a]
- Updated dependencies [839011e]
- Updated dependencies [f0ade22]
- Updated dependencies [29a36ac]
- Updated dependencies [7753bdc]
- Updated dependencies [47aba08]
- Updated dependencies [fac08c0]
- Updated dependencies [5b3508d]
- Updated dependencies [fe0c1e0]
- Updated dependencies [2ce079c]
- Updated dependencies [b502e0e]
- Updated dependencies [be3e274]
- Updated dependencies [979053a]
- Updated dependencies [b2dddbc]
- Updated dependencies [ab0c1a6]
- Updated dependencies [80a3577]
- Updated dependencies [47aba08]
- Updated dependencies [99538fa]
- Updated dependencies [fb2a6d8]
- Updated dependencies [94a9f13]
- Updated dependencies [427ce99]
- Updated dependencies [b7c9514]
- Updated dependencies [d3ab865]
- Updated dependencies [0bef08b]
- Updated dependencies [aa33728]
- Updated dependencies [6d51def]
- Updated dependencies [8c4f475]
- Updated dependencies [1d61bae]
- Updated dependencies [5d67836]
- Updated dependencies [444371c]
- Updated dependencies [d617d34]
- Updated dependencies [6f03f61]
- Updated dependencies [2c572e3]
- Updated dependencies [84fe6d5]
- Updated dependencies [e73a5fc]
- Updated dependencies [1de054a]
- Updated dependencies [9341d31]
- Updated dependencies [2e3e56d]
- Updated dependencies [db1a6a1]
  - gesso-core@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [d27e076]
- Updated dependencies [d6c52da]
  - gesso-core@0.4.2

## 0.4.1

### Patch Changes

- **A patch batch copies each container once.** `applyPatches` copied every
  container on a patch's path once per patch, so a batch of N patches into one
  K-key object cost N × K — a store publishing a wide keyed map at 60 Hz could fall
  minutes behind. A batch now copies each container once and writes into its own
  copy in place. It never writes into the value it was handed nor into a value a
  patch carried.
- Updated dependencies
  - gesso-core@0.4.1

## 0.4.0

### Minor Changes

- **The browser shells post OS file drops.** The `fileDrop` message, its shape and
  the session that turns it into an ordinary drag have existed since drop targets
  did, and nothing posted one: a zone accepting `gesso/files` could be written and
  never reached.

  `attachFileDrop` is the shell half, shared by `createApp`'s worker shell and
  `createSyncApp`'s single-thread one because it is the same four DOM events
  either way. It answers drags that carry files and no others, prevents the
  default on every `dragover` (which is what tells a browser the drop is wanted)
  and on `drop` (or the tab is replaced by the file), and reads the bytes before
  posting the drop. The worker shell transfers the buffers rather than copying
  them; a drop whose files cannot be read is reported as a leave, so no zone stays
  lit waiting. `GessoRuntime.applyFileDrop` hands the message to the tree's drag
  session.

  The core half was wrong in a way no spec could have caught: `applyFileDrop` began
  a drag with the files of `enter` and, on `drop`, only moved it, so a zone
  received the payload the drag started with. A browser lets a page see the _types_
  of dragged files and nothing else until they are let go, so that payload has
  empty names and no bytes — every file dropped from a desktop would have arrived
  unopenable. The spec that covered it sent the same files on both phases, which is
  the one shape a browser never produces. It now sends what one does.

- **`interceptKey`, for a shortcut the app takes from the browser.**
  `interceptFind` cancelled one browser default so an app's own find bar could
  have Ctrl+F. An app with a Save of its own needs the same for Ctrl+S, or
  Chrome's "Save page as" opens over it, and one with an Open for Ctrl+O.

  The shell has to decide before the worker has heard of the key, so the decision
  stays the application's and is made on the main thread: a predicate over the
  `KeyboardEvent`, which can say "Ctrl or Cmd" in one line where a list could not.
  The key is still forwarded; only the browser's default is cancelled. The
  single-thread shell needs nothing, since its platform adapter already cancels
  whatever the app's own listener claimed.

- **Files through the shell — open, save, reopen, recent.** A picker, a download
  and a `FileSystemFileHandle` are all the window's, so an application in a render
  worker could read a dropped file and do nothing else with files at all.
  `ShellService` now asks the shell, in the shape a popup and a storage request
  already have: a request with an id, and one `ShellFileResult` back on every path.

  ```
  openFiles    showOpenFilePicker, or a file input where there is none
  saveFile     to a handle (Save), a picker (Save As), or a download
  reopenFile   a remembered file, asking permission again if it lapsed
  recentFiles  the remembered files, most recently used first
  forgetFile   stop remembering one
  ```

  A handle crosses as a number. The `FileSystemFileHandle` is not plain data, so
  the shell keeps it — in IndexedDB, which can hold one — and a number handed out
  yesterday still names yesterday's file, which is the whole of how "recent files"
  survives a reload. The same file picked twice is one entry (`isSameEntry`, not
  identity), and past fifty the least recently used is let go. What does not
  survive a reload is the permission, and asking needs a gesture, so reopening
  belongs in a click handler as much as a picker does.

  `cancelled` is its own outcome because closing a picker is a decision, not a
  failure; `denied` is the browser refusing; `unsupported` is a shell with no way
  to do it. Without the File System Access API files come back with `handle` null
  and a save is a download, and the answer says so rather than leaving the
  application to feature-test.

  `saveFile` takes bytes as well as text, for a file that is not text — a zip, an
  image. Bytes cross the barrier on the way out as they already do on the way in,
  in `ShellFile.bytes`, and are written to the handle, the picked file or the
  download in place of the text when given.

### Patch Changes

- **A key typed before the editing proxy has focus keeps its text.** The proxy
  takes DOM focus when the worker reports a focused editable, a round trip; a key
  typed in that gap reaches the canvas, and the text it would have made never
  exists.

  The `keyDown` message now says whether it came through the proxy (`textFollows`),
  and a key that did not is inserted by the runtime when an editable has the focus.

  Typing a word quickly into a spreadsheet cell the first letter opens kept only
  the first letter.

- **A shell request made while the root is built is held, not dropped.** The root
  is built in the runtime's constructor, so a component that reads a stored
  preference as it mounts asked before `onShellRequest` could have been called,
  and the request went nowhere — for a storage or file request, a promise that
  never settled.

  The runtime now holds what is asked before a listener attaches, up to 256, and
  hands it over when one does.

  Found by a spreadsheet's status-bar figures that never came back after a reload.

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-core@0.4.0

## 0.3.0

### Minor Changes

- 025321a: **Breaking: the single-thread configuration is `createSyncApp`.** `createApp` now
  builds the worker configuration and nothing else.

  ```diff
  -createApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
  +createSyncApp(AppRoot).useChannel(Catalog, { source }).mountSync('#app');
  ```

  Nothing else changes: same builder, same methods, same `mountSync`. The worker
  form, `createApp({ renderWorker })` and the form `gesso-vite-plugin` writes, is
  untouched, so an application that mounts into a render worker needs no edit.
  `createApp` given a component throws and names `createSyncApp`, because the fix
  is one identifier and a message that does not say which one turns a rename into
  an afternoon.

  The reason is what it costs on the wire. `createApp` took either the options or
  a root component, and the overload that took a component reached
  `GessoAppBuilder` → `GessoApp` → `GessoRuntime`: the layout engine, both
  renderers and the hit-tester, statically, in every shell. A bundler cannot see
  which half of one function a given call reaches, so every worker application
  shipped the whole engine to the thread whose entire job is to create a canvas
  and forward input.

  Measured on the smallest honest shell, built from source:

  |        | raw      | gzipped  |
  | ------ | -------- | -------- |
  | before | 662.9 kB | 169.3 kB |
  | after  | 46.2 kB  | 12.3 kB  |

  And on a real application, gessosheet's shell: 524.9 kB to 152.9 kB raw, 152.7 kB
  to 45.0 kB gzipped. `check-bundle-size.ts` holds the line in CI with a budget and
  with a look for Canvas2D calls in the shell's bytes, because the number alone
  would pass a build that kept the rasterizer and got lucky.

  Two names cost one line in the configuration that was always the exception, and
  take 120 kB off the main thread of every other kind.

- 025321a: **`fanOut`, for when every node wants its own slice.** One source, N things on
  screen, each reading one part of it: a grid, a timeline, a log viewer all arrive
  at this shape, and the natural spelling does not scale. A pipe per slice runs N
  pipelines on every emission whatever changed, and RxJS removes an observer from a
  Subject by scanning its list, so tearing down a window of N is quadratic.

  `fanOut(source, read, { initial })` holds one subscription for the whole registry
  and hands out a stable cell per key. Its `changed` hint is where a frame is won: a
  source that knows which keys a patch touched reads only those. Ten thousand live
  keys, measured against a pipe per key: mount 29.8 ms to 10.7 ms, teardown 9.7 ms
  to 3.7 ms, and one key changing 2.2 ms to 0.1 ms.

  Reach for it when N is large _and each emission touches few of them_. A source
  that republishes its whole window on every scroll gets the cheaper mount and
  teardown and nothing from `changed`, because every key really did change.

  It compares by reference where `select` and `derive` compare by content, which is
  the opposite default for the opposite reason: those run once per emission and this
  runs once per live key per emission. And a registry that has grown past a couple
  of thousand keys having released none of them says so once, because `release` is
  the caller's and forgetting it is the one thing here that goes wrong silently.

  **`tabStop`, which is `tabindex="-1"`.** Focusable, reachable by a press and by
  `focus()`, skipped by the Tab cycle. `focusable` only ever answered "may this node
  hold focus", which is the wrong question for a container: `UiFocusManager.settleScope`
  blurred when a scope held nothing focusable, so a `Dialog` whose content is a
  sentence handed the keyboard to nothing and could not be dismissed with Escape.
  `settleScope` now falls back to the scope root before blurring, and `Dialog` sets
  `focusable: true, tabStop: false` on its body. Both halves are needed and neither
  is enough alone.

  **`borders()`, a border per edge, as paint.** `borderWidth` is one number and
  `borderColor` one colour, so a node could not have a heavy bottom edge and a
  hairline top. A border here is paint-only and a decoration is already a coloured
  rectangle in the node's own paint pass, so four edges are four draw instances and
  no extra nodes. `DecorationBox` gains `right` and `bottom` to put them: any two of
  near edge, size and far edge fix an axis, which is CSS's rule for an absolutely
  positioned box, and the only one that can express a side edge spanning between two
  horizontal ones.

  **`menuBarStep`, a menu bar's keyboard, as a peer of `Menu`.** `Menu` traps focus,
  which is right for a popup opened by a button and wrong for a bar: with focus in
  the panel, ArrowLeft cannot reach the bar to move to the menu next door, and that
  is most of what makes a bar a bar. A pure function, generic in the command type,
  that returns null for a key it does not claim, so a bar can still be tabbed out of.

### Patch Changes

- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-core@0.3.0

## 0.2.1

### Patch Changes

- gesso-core@0.2.1

## 0.2.0

### Patch Changes

- be07839: **Sound a picture can follow, and a screen it can fill.** Two things
  the render thread cannot do for itself.

  `audioClock` reads where `AudioService` has got to and hands it to
  `videoSource` as a `VideoClock`, so a clip's picture follows the sound
  rather than a tween of its own. `AudioContext` does not exist on a
  worker, so the sound is the shell's to play and this is the adapter
  between them. The source is checked on every read, because one
  `AudioService` serves the whole application and a screen that starts a
  podcast while a clip is mounted would otherwise drive the picture from
  the podcast's position.

  `ShellService.requestFullscreen` asks whichever shell is in front to
  fill the screen with the canvas, and `ShellService.fullscreen` reports
  what actually happened, because a browser only grants fullscreen during
  a gesture and can refuse, and the person can leave with Escape, which
  no request hears about.

  The part that took measuring is the size. A `ResizeObserver` watches
  the host, and the host does not change when the canvas is lifted out of
  it; it reflows _because_ the canvas left. The runtime kept laying out
  at the old size and the browser stretched the result: a canvas whose
  CSS box was 800x600 still had a 768x448 backing store, and every
  coordinate was wrong by the ratio between the two, so a press near the
  bottom of a fullscreen clip landed near the middle of the layout. The
  size now comes from the canvas while it is fullscreen and from the host
  when it is not, read a frame late, because `fullscreenchange` fires
  before the new geometry is in the layout.

- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
  - gesso-core@0.2.0

## 0.1.0

First public release.

Components, cells, the frame runtime, channels, routing and the worker
barrier.

A component body runs once and an `Observable` binds straight into the
retained graph, so there is no re-render pass, no virtual DOM diff and no
`useEffect`. An application is three files across three threads joined by one
contract module: `channel()` names the shapes, `serveChannels` serves them
from the application worker, `renderRoot` draws on the render worker, and
`createApp` on the main thread spawns both and then holds neither end.

`createApp(App).mountSync('#app')` runs the same contract in a single thread,
for tests, headless rendering and environments without `OffscreenCanvas`.

**The accessibility mirror.** The shell writes the semantics tree into an
off-screen DOM over the canvas, so a screen reader, an OS accessibility API or
an automated testing tool sees real elements where before it saw one empty
canvas. On by default in both configurations; `accessibility: false` opts out.
Presses, focus moves and value sets come back as ordinary input.

**Failures reach the shell.** `renderRoot` listens for `error` and
`unhandledrejection` on the worker global, so a component that throws during a
frame is reported rather than lost; `UiInputDispatcher.onListenerError` reports
the exceptions it has to swallow, so an `onClick` that throws is no longer
logged only to a worker console. The protocol's `error` carries a `source` of
`message`, `uncaught`, `renderer`, `channel` or `listener`.

Entry points: the root, `/worker`, `/jsx-runtime`, `/jsx-dev-runtime` and
`/testing`.
