# gesso-core

## 0.6.1

### Patch Changes

- 45f3ffe: Copying a selection over truncated text now copies the text the truncation hides, as a browser does with `text-overflow`. A `<text>` with `maxLines` or `textOverflow="ellipsis"` used to copy only the glyphs it drew, so a title shown as "Brand Story & Brand…" copied as "Brand Story & Brand".

  A selection that stays inside the drawn glyphs still copies just those. One that reaches the end of a truncated line, onto the far half of the ellipsis or past the last glyph, copies through the end of the string, and so do select all, a selection that runs through a truncated node on its way to the next, and a triple click on the line. A double click on a word the ellipsis cuts takes the whole word. The ellipsis is highlighted whenever the selection includes text it hides.

  `ParagraphGeometry` gains `source`, the whole text, and `sourceEnd`, the offset a selection may run to; `offsetAtPointIn` can answer `sourceEnd` and `selectionRectsIn` includes the ellipsis box for a range that reaches past `end`.

## 0.6.0

### Minor Changes

- bf21b17: A `Dialog` dims the page behind it, as a browser draws `<dialog>::backdrop`. Palettes have a new `scrim` token, a colour with alpha: the light page's ink at 40% in `lightColors`, black at 60% in `darkColors`, and left alone by high contrast. A custom palette written out in full needs one. Overlay entries take `scrim`, on by default for a `modal` entry and off for every other, so a menu or a list of suggestions never dims the page; the scrim takes its theme from the entry's `environment` and fades in at a dialog's pace, or appears at once under reduced motion. `Dialog` takes `scrim={false}` to leave the page undimmed; its backdrop still keeps the page from presses.
- 013e064: `color` cascades, as the property reference always said it did: text that names no colour takes the `color` of the nearest ancestor that set one, unless a nearer `textStyle` brings its own. A theme token travels as a name and is resolved where the text is painted, so `<box theme={darkTheme} color="text">` draws its plain text in the dark palette's `text`, and a card inside it that provides another theme draws in that theme's. Until now a node's own `color` reached nothing below it, and plain text under a dark root drew in the default style's near-black on the dark background. Text that already names a colour or a role is unchanged; text that names neither, under a container that sets a `color`, now takes that colour. Changing a cascaded colour repaints the subtree without laying it out again. `UiEnvironmentKeys.color` is the new key the colour travels on, and an overlay carries it from where it was declared.
- 684d68a: The text style properties cascade, as the property reference always said they did: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `textDirection`, `fontStyle`, `fontStretch`, `fontVariant`, `fontKerning` and `textDecoration` set on a container now reach the text below it. Until now they were inherited only from the nearest `textStyle`, so `<row fontSize={12}>` left every text in the row at the default 14. A container's fields are laid over the style in scope, so `<box textStyle="body" fontWeight={600}>` gives its text the body style in a heavier weight, and a text that sets a field itself keeps its own. A container that sets `fontSize` without `lineHeight` gives the text below it a normal line for that size, 1.2 times it, as it already did for itself. Text under a container that sets one of these now draws, and measures, with it. Changing a cascaded underline, alignment or direction repaints the subtree without laying it out again.

### Patch Changes

- 3b20918: An absolutely positioned node is placed again when its containing block changes size, even when its parent keeps its box. A panel pinned to the window's corner from inside a column used to stay where that corner was when the window was resized, because nothing placed the column, and so the panel, again.
- e9f86a2: An anchored overlay (a tooltip, a menu, a popover) now opens beside where its anchor is drawn when an ancestor of the anchor has a `transform`. A card on a panned and zoomed canvas used to get its tooltip where the card would be at zoom 1 with no pan, often nowhere near it; the anchor is now carried through every ancestor's translate, scale and rotation, as well as the scroll offsets it already followed, and an overlay that lives under a transform of its own is placed in that space. The accessibility mirror puts its elements over the same drawn boxes, so a screen reader's outline and touch exploration find the card where it is. A node's own transform still takes no part, so a turning spinner neither shakes its tooltip nor moves its element. `LayoutEngine.screenBox(node)` answers the question for anything else that needs it.
- a81d551: A row or column without a size of its own no longer comes out wider than the space it was given because a `flex: 1` child holds long content. It wrapped around that content's whole line, past its own maximum, and nothing flexed: in a fixed-size button, which centres its content, a long label was pushed off both edges and the first words of it were clipped. The container now stops at the space there is, and the flexible child takes what is left, wrapping or truncating its text there.
- 820aee8: Everything that measures a node against the canvas now takes the `transform` of every ancestor into account, as painting and hit testing always have. Under a panned and zoomed parent (cards on a map inside a "camera" box) several things used to work from where the node would be drawn at zoom 1 with no pan:

  - A press from the accessibility mirror or an automation tool, and Enter or Space on a focused button, now click the centre the node is drawn at rather than a point that could be off the node entirely.
  - A modifier's `layoutBox()` and the box `onLayout` reports are the drawn box, so a slider, split pane or colour picker on a zoomed card turns a press into the right value, and `onLayout` hears when a pan above the node moves it on screen. Its size is the drawn size, so a fraction of it stays a fraction; `flowBox()` keeps the laid-out size, and the motion pivot, `breakpoint`, `sizeContainer` and `publishInset` now read that, so a zoom neither shifts a pivot nor crosses a breakpoint. The new `measureFlow` modifier is `measure` for the laid-out box; a virtual list's reveal and a `DataTable`'s sticky header use it, so they scroll by the right amount under a zoom.
  - The caret rectangle handed to the shell, which positions the hidden text field and the IME candidate window, follows the caret where it is drawn.
  - A press beside the fields of an editing group, a drag across them, and a text selection dragged past the end of a line find the field or line nearest the pointer on screen.
  - The mirror's box for a focused node that is scrolled out of view, and the layout inspector's highlight and heatmap, are drawn over the node where it is.

  `LayoutEngine.screenBox(node, part?)` takes an optional rectangle in the node's own coordinates and answers where that part of it is drawn. `EditingHost` and `SelectionHost` take an optional `screenBox`; a host without one behaves as before. With no transform above a node, every answer is the same as before.

## 0.5.1

### Patch Changes

- 77195a4: Two more semantics properties, for a field that opens a list of suggestions. `controls` is a relation, like `activeDescendant`: the node this one shows or changes, such as the list a combobox's field has open, held on the record as that node's id and written by the mirror as `aria-controls` naming its element. `autocomplete` (`'list' | 'inline' | 'both'`, the new `UiAutocomplete`) says what a field offers as it's typed into, written as `aria-autocomplete`. The editing proxy writes both while a field has focus, so `EditingMirrorTarget.describe` takes the controlled element's DOM id after the active descendant's. `Combobox` uses them: its field controls the list while it's open, and its autocomplete is `list`.
- 6b71716: An overlay can open beside a part of its anchor: `anchorRect` on an overlay entry (and on `useOverlay`'s options), and the layout property of the same name, is a rectangle in the anchor's own coordinates that the entry is placed against, with the same flip and shift, and that it follows through scrolling and layout as it follows the anchor. It can be an Observable, so it moves without the entry opening again. `EditingService.caretRectOf(node, offset)` (and `UiEditingController.caretRectOf`) answers for a character other than the caret's, so a list opened by `@` sits under the `@` as the name is typed, and goes to the next line with it when it wraps. A point opened beside the caret stayed behind when the page scrolled.
- 581cf89: An open overlay now follows the theme of the place it was declared. The overlay layer read the theme, text style and content colour once, as the entry opened, so a dialog or menu open when the system turned dark, or when a theme the person chose arrived from another worker a moment after they opened it, stayed in the old theme over a page in the new one until it closed. Underneath, a modifier's `host.environment(key, of?)` and `host.onEnvironment(listener, of?)` can read and follow another node's environment, and an environment provided by a node whose own environment changed in the same frame is rebuilt in that frame.
- 13c096f: Two ways to show a shortcut besides `formatShortcut`, for a help sheet. `shortcutKeyCaps(steps)` gives the keys one string at a time, one array per press (`[['⇧', '⌘', 'K']]` on a Mac, `[['Ctrl', 'Shift', 'K']]` elsewhere), to draw as key caps; they are the pieces `formatShortcut` joins. `describeShortcut(steps)` says it in words a screen reader reads out (`Shift Command K`, `Down arrow`, `Question mark`, `g then d`), since a cap's symbols are read inconsistently and punctuation is skipped.
- db7040b: A shortcut on punctuation, a digit or a symbol now matches the character the press produced, whatever it took to type it. `keys: '?'` used to match nothing, because every layout reaches `?` with Shift (Shift+/ in the US, Shift+ß in Germany, Shift+, in France), and `'Shift+?'` worked only where the layout used Shift rather than AltGr. Now `?` and `Shift+?` are the same shortcut, and a bare symbol also matches when AltGr (Control and Alt, or Option on a Mac) typed it. Letters keep their Shift, so `Shift+L` and `l` stay apart.

## 0.5.0

### Minor Changes

- 5a27b40: `activeDescendant` names the node that's active while another keeps focus, such as the highlighted option of a combobox whose field holds the caret, or the cell a grid's cursor is on. The semantics record carries it as the node's id, and the accessibility mirror writes `aria-activedescendant` from it, both on the node's element and on the editing proxy while a field has focus. Every mirrored element now has a DOM id for it to point at. The proxy also says `aria-expanded` for a field whose record is expanded or collapsed.
- 20ac739: A `<button>` centres its children both ways by default, as an HTML button and the `Button` component do. A box still starts its children at the top left. A button that relied on the old top-left placement says `x="start" y="start"`.
- 8fb3607: A `current` semantic state, mirrored as `aria-current`, for the current item of a set such as the navigation link to the open page. `selected` was the only way to say it, and on a link or a button a screen reader ignores `aria-selected`, so which page was open went unsaid.

  `Pagination` marks the page you're on `current` instead of `selected`.

- 53b4c46: A copy can put HTML on the clipboard beside the text. An editing group's new `copyHtml(start, end)` gives it, for a selection across fields or inside one field of the group, and `EditingState.html` carries it to the shell, whose copy and cut set `text/html` as well as `text/plain`. A rich editor's copy into a document or an email keeps its formatting. What a group makes of a selection is kept until the selection or its text changes, so `copyText` and `copyHtml` are no longer asked every frame.
- d356006: A press inside an editing group that lands on none of its fields (its padding, the gap between two fields, a list item's bullet) goes to the nearest field by height, with the caret at the nearest position, as a document does. A press on something that answers presses itself, a button or anything with a click or pointer listener, is left to it. `UiEditingController.fieldNear` is the lookup.
- 101ea8a: An editing group can follow its selection: `onSelectionChange` hears a selection across fields begin, move and end, so an application can run its own commands, such as bold or indent, over all of it.
- 839011e: An editing group's fields are one Tab stop, at the first field: Tab from any of them moves past the group, and Tab back in lands on the field last focused. A document of many blocks was a stop per block, and a screen-reader user walking a page with Tab went through every paragraph of a description to reach the controls after it. Other focusable nodes inside the group, a task's checkbox, keep their own stops.
- f0ade22: Editables can select as one. Set `editingGroup` on a container and a selection can start in one field and end in another: arrows move between fields at their edges (up and down keep the column), Shift extends across them, a drag or a Shift and press reaches into other fields, and select all takes the whole group. Every field in the range draws its part. Typing, deleting, Enter, paste and cut over such a selection go to the group's `onEdit` with both ends, since only the application knows how its blocks join, and copy and cut take the whole selection, as the group's `copyText` if it gives one.
- 29a36ac: `EditingService.select(anchor, focus)` sets a selection from code, in one field or across the fields of an editing group, and focuses the field its focus end is in. An editor needs it to leave a selection selected after a command over it, since its fields can only select their own text.
- fac08c0: Focus from code can leave the page where it is, as `element.focus({ preventScroll: true })` does: `autoFocus({ preventScroll: true })`, `FocusService.focus(node, { preventScroll: true })` and `UiFocusManager.focus(node, source, { preventScroll: true })`. For focus placed for a screen reader, such as a page's content region focused as it opens, which a reveal scrolled to a few pixels short of its own top. The options reach `onFocusChange` listeners as a third argument, and a key pressed later that makes the focus visible doesn't scroll to it either. The default is unchanged.
- 5b3508d: `gridcell` is a role: the cell of an interactive `grid`, such as a calendar's day, and the cell that can be `selected`. `cell` stays for a table's cells.
- b502e0e: A text run can be `hidden`: it stays in the text, with its offsets, its place in a copy and in undo, but takes no room, is left out of line breaking and the line box, and neither renderer draws it. In a field the caret steps over each stretch of hidden text as one unit: arrows cross one visible character or word and the hidden text in the way, Backspace and Delete remove the visible character next to the caret and keep the hidden text beside it, a press resolves to the side of hidden text it lands on, and a double click selects the word as drawn. While an IME composes, a field's runs are moved to make room for the composing text instead of being dropped, so styling and hidden text survive the composition. Caret and selection geometry in a field with runs is now measured run by run, so a caret after a bold or larger run sits after its glyphs.
- 979053a: A layout listener that changes layout is painted on the same frame. `breakpoint`, `sizeContainer` (and so `Responsive`), `autoFocus` and anything else on `host.onLayout` hear a box after layout, and what they wrote used to be laid out on the next frame, so a page whose breakpoint gave it wide padding was drawn with its narrow padding first and jumped. The runtime now lays out again before it paints, as a browser does after a `ResizeObserver` callback: only what the listeners dirtied, telling only the listeners whose boxes then changed, until they write nothing more that lays out. The loop is bounded at 8 layout passes a frame; past it the frame paints what it has and a warning says so once. A frame whose listeners write nothing that lays out runs one pass. A scroll into view asked for while the listeners run (an `autoFocus` revealing its node) waits until the boxes are final. `FrameMetrics.layoutPasses` counts the passes, and `measured` and `relayoutRoots` count every pass. A geometry `sharedElement` morph lands on the frame of the change instead of being covered by a transform for one frame. `UiScheduler.recollect`, `UiFrame.merged` and `DirtyNodeSet.anyFlags` are what the runtime builds this from.
- 47aba08: The stock theme is drawn the way current interfaces are. Text is set in `system-ui, sans-serif`, the platform's own face, on line heights from a 4-point grid (body is 14 on 20, not 14 on 16.8), and in a blue-black ink rather than black. The palettes use cool-tinted neutrals and a deeper accent, so white on `primary` and `controlAccent` clears WCAG AA, which the old bright blue did not; every stock text pair in both palettes is now held to AA by a test. A medium button is 36 high with 16 either side. Select, DatePicker, Accordion and Tree draw their disclosure arrows as Heroicons chevrons rather than as `▾` and `▸`, which every face set at a different size. An application on the stock theme reflows: text that names no size is taller, and a layout measured against 16.8 moves. A theme that sets its own typography and palette is unaffected except for the button padding, which is a `controlTokens` value it can set back.
- 99538fa: A `multiselectable` semantic state, mirrored as `aria-multiselectable`. A list whose rows are selected as a set had no way to say so, and Chrome took the option under its active descendant to be the selected one: a screen reader announced a row as selected that wasn't.
- fb2a6d8: A precision device's wheel steps are paced over frames. A trackpad sends on its own clock, so a frame got one, two or three of its steps and a steady flick moved unevenly; the runtime now moves each frame by the rate the steps have been arriving at, never more than a frame behind, and applies the rest when the input stops. `UiWheelController` takes a `pace` option and an `advance()` a host calls once a frame; the runtime turns it on.
- 94a9f13: Both renderers paint `boxShadows`, with CSS `box-shadow` semantics: offset, blur, spread, colour and `inset`, following the node's corner radius, with the first shadow on top. Until now the prop resolved and nothing drew it, so every theme's `shadows` scale did nothing. Canvas2D draws a shadow with the canvas's own blur, cast from a shape thrown outside the clip; WebGPU evaluates the blurred rounded rectangle in the fragment shader, one quad per shadow. A shadow's colour may now be a palette name (`boxShadow(0, 4, 8, 0, 'shadow')`), resolved against the node's theme like any other colour, so `UiBoxShadow.color` widens from `UiColor` to `UiColorValue` and `PaintState.boxShadows` holds the resolved `PaintBoxShadow`. A node's paint extent now takes in its outer shadows, so a card just off screen still casts its shadow on, and changing a shadow updates it without a layout pass. The WebGPU primitive instance grows from 20 to 24 floats, and its kind is read as the float it is written as.
- b7c9514: A paste carries the clipboard's HTML along with its text. The shell read only the plain text, so a copy from a web page or a document arrived without its headings, lists and links. `UiBeforeInputEvent`, `UiPasteEvent` and an editing group's edit now have `html` (null when the clipboard had none); the field still inserts the plain text, and an editor that keeps structure can cancel that and convert the HTML. `fireEvent.paste` takes the HTML as a second argument.
- 6f03f61: A shortcut prints the way the platform writes its own: `⇧⌘K` on a Mac and `Ctrl+Shift+K` elsewhere, in `formatShortcut` and every binding's `display`. It printed `Ctrl` everywhere, on the grounds that the render worker couldn't see the platform; it can, from the user agent, and the editing keys already follow it. `formatShortcut(steps, platform)` prints for a platform of the caller's choosing.

### Patch Changes

- 8d25c04: A drop target with `autoScroll` now scrolls while a drag is held near its edge even when a deeper drop zone, such as a row inside the list, is the one that would take the drop. Before, auto-scroll ran only on the winning zone, so a list whose rows were drop targets never scrolled during a drag. Drop zones can implement the new optional `UiDropZone.hover(state)`, which is called for every accepting zone under the pointer, and `dropTarget` uses it for auto-scroll.
- 303e85a: Canvas2D draws a row millions of pixels down a scroll container on its pixel. Skia keeps the canvas transform and every coordinate in 32-bit floats, so a scroll offset of a hundred million pixels and a row at the same depth were each rounded to the nearest eight pixels, and the rows of a five-million-row grid came out with gaps and overlaps near the bottom. A translation of a million pixels or more is now held in a double and added to each coordinate before the canvas sees it. Nothing changes below that.
- 0f02fc2: A frame clamps the text scroll of the fields it laid out or scrolled, rather than of every field ever laid out. In the issue tracker's 5,000-line document that was five thousand clamps for each keystroke.
- 4450c5c: A re-render that stops declaring a property takes it off the node. Only bindings were torn down before, so a plain value stayed: a conditional that swapped `<scrollview padding={20}>` for a `<scrollview>` reused the node and kept the padding. What modifiers and the runtime write on a node is left alone, and a modifier overriding the property keeps its value. `UiGraph.removeNodeProperty` is the removal, through the same cascade as a write.
- 7753bdc: A bare Enter or Space is no longer a shortcut while a button or link has focus, unless the shortcut is that control's own. Pressing a button is a default action applied after the key has been through the registry, so an application-wide Enter took the key from the focused button: in the issue tracker, Enter on "Clear selection" opened the issue under the list's cursor instead of clearing.
- 47aba08: A flex line that fits to within float noise no longer flexes. A container sized to its content sums its items in one order and the line sums them in another, so "exactly enough room" could arrive as -3e-14 and shrink an item with a fixed `width: 28` to 27.99999999999997.
- fe0c1e0: Text without runs is broken into lines one hard line at a time and remembered per line. A keystroke in a long multiline field re-wraps only the line it changed instead of the whole text: typing into a 5,000-line field went from about 19 ms of layout to about 3.5 ms. Text with `spans` keeps the previous path, because its widths are measured by offsets into the whole text.
- 2ce079c: A hidden (`visible={false}`) or disabled subtree has no Tab stops and refuses focus, as `display: none` and a disabled fieldset do in a page. Only the node's own `visible` and `disabled` were checked, so the buttons of a toolbar hidden until something was selected were Tab stops nobody could see, and a screen reader heard nothing at them.
- be3e274: An IME commit that is what the composition already showed now fires `onInput`. The commit was compared with the text that already held the composition, so picking the candidate on screen (the usual case) changed nothing as far as the field could tell, and an application holding the text never heard of it.
- b2dddbc: A window resized to a size it had been at before now lays out at that size. Two things went wrong. A node sized in percent was handed back the size it had under a different container, because the container's size was not part of what layout remembered. And a stack whose measurement came from that memory placed its children at whatever size they had last been measured, which could be the other window's. An application shell with a percentage-width sidebar kept its sidebar at the old height, with the footer off screen or floating above the bottom, until something else changed.
- ab0c1a6: A line's only flex item, growing and shrinking to fill a line of definite size with a minimum of its own, no longer marks its content as read: no base could change its size. Since a content basis started marking its subtree, an application region like that (the issue tracker's main pane) had every row its list mounted on a scroll laid out from the root.
- 80a3577: Layout remembers three measurements per node instead of two. A row holding a flexible scroller of auto-height blocks asks each block three questions per pass: unbounded for the flex basis, at the final width, and at the stretched height. With room for two, every pass evicted one, so editing one block of a 1,000-block document re-measured all 6,005 nodes. It now re-measures under 20.
- 427ce99: The renderers cull a node by where its subtree may paint rather than by its own box, so a child painting outside a parent that doesn't clip, as the docs say it may, is drawn when the parent's box is off screen or empty. The issue tracker's tour, an absolutely positioned panel inside an empty wrapper, was laid out and never drawn. Each layout record keeps that extent, the box whenever nothing reaches past it, so culling costs what it did.
- d3ab865: A predicted trackpad flick no longer springs off an edge it runs into, or steps back as it slows: room is judged from where the steps have really taken the container, each frame sets a clamped position, and a frame never moves against the latest step.
- 0bef08b: A precision device's scroll is predicted to the frame rather than paced behind it. Each frame puts the page where the input will have reached when the frame is shown, from the steps' velocity and their timestamps, which the shells now pass with each wheel event; the page stays as even as pacing made it without trailing the hand by a frame. `UiWheelController.wheel` takes the event's time, and `advance` the frame's.
- aa33728: A press in a field places the caret by the layout the press landed on. The offset is read before the press moves focus, so a field that draws itself differently once focused (one that shows hidden runs, or restyles its text) puts the caret where the person pressed in what they saw, not at the same x in the new layout.
- 6d51def: A `ref` is handed its node once the node's props are all written and it has the environment it will be under, wherever `ref` sits among the props. It used to fire as the builder reached it, so a node built this pass had the default environment: an overlay opened from a placeholder's ref, as a `Toast` mounted already open does, took the light theme in a dark app.
- 8c4f475: Revealing a node bigger than its scroll container brings it in by its start, unless it already fills the view, as CSSOM's `nearest` does. It was moved by its nearer edge, which for a tall node is its end: the issue tracker's issue page, which focuses the whole issue when it opens, opened scrolled to the bottom.
- 1d61bae: A scroll view with no size of its own along the axis it scrolls is its content's size, within its bounds, as the docs said and CSS does. A loose bound such as its own `maxHeight` was taken as its size, so a dropdown list capped at 280 pixels was 280 pixels of mostly empty panel when it held two options. A tight bound (a flexed or stretched size) still sizes it.
- 5d67836: The runtime keeps the accessibility tree as records by id plus each record's children in order, and works out a record's index only when it sends that record or the tree is asked for. A structural change used to renumber every record after it and rebuild the whole tree's order, a pass over the whole document on every Enter in a long editor. An Enter in a 5,000-line document now spends about 3 ms on semantics where it spent 7 to 10. The structural rebuild goes through `rewalkSemantics`, and `SemanticsMemory` is what each walk leaves for the next.
- 444371c: A change in the shape of the tree no longer rebuilds the whole accessibility tree, and no longer sends every later sibling an update. The tree is rebuilt from the nearest record above the change, and anything inside it that nothing touched is taken back as it was: renumbered if it moved, never described again, and a transparent subtree (a block of a long document) taken back as a run without being walked. Updates that only renumber a record whose siblings kept their order are no longer sent, since a mirror that applies removals and adds in order already has it in place: inserting a paragraph in a 5,000-line document sent 4,266 patches to the main thread, and now sends 2. `diffSemantics` gains a companion, `dropIndexShifts`.
- d617d34: A laid-out subtree that moves without changing size is shifted instead of placed again. Boxes are absolute, so inserting a row near the top of a long list moved every row below it, and each one was placed again all the way down: an Enter in a 5,000-line document placed 9,572 nodes and took 18 ms of layout. It now places 7 and takes about 3 ms. `LayoutStats` gains `shifted`, the number of subtrees moved this way.
- 2c572e3: Shortcuts can bind the space bar. `shortcut({ keys: 'Space', … })` never fired before: a shortcut string splits on whitespace, so the key can't be written as `' '`, and the name `Space` was kept as a literal key name that no press ever matched. `Space` (and `Spacebar`) now mean the space bar, with any modifiers, and `formatShortcut` prints it back as `Space`.
- 84fe6d5: A focused text field keeps its editing keys. An application-wide shortcut on `Mod+Z`, `Mod+A` or a word or line move no longer fires while keys go to a field, so undo in a field undoes the typing rather than the app's last change. Other modified keys, and Enter in a single-line field, still reach the registry.
- e73a5fc: Scrolled content is drawn on a whole device pixel. The offset keeps the fraction, so a trackpad's small steps still add up, but Canvas2D drew the content at the exact offset, and text between pixels rasterised differently each frame, shimmering as a flick slowed down.
- 1de054a: A frame's layout agrees with a fresh one when content arrives under a flex item whose basis is its content. The item's basis was read from a child whose `height: 100%` had nothing to resolve against yet, and the same child, resolved on the next measure, was then treated as a relayout boundary, so rows arriving in a list never reached the basis. The column kept sharing its height as it had while the list was empty, until something unrelated (a theme change, a resize) laid it out from the top, and an application's header then shrank under the reader. A scroll view with no size of its own passes the same on to its content, since under a loose bound its size is its content's.
- 9341d31: A trackpad's steps are no longer smoothed one at a time. Chrome on a Mac reports a trackpad's legacy `wheelDeltaY` as three times its pixel delta, so a 40-pixel step looked like a mouse wheel's detent and was animated while the steps around it weren't, which stuttered a flick, most of all as it slowed. Once an event that doesn't look notched arrives, the wheel is taken to be precise while events keep coming.
- 2e3e56d: A colour that's neither a palette name the node's theme carries nor a colour now warns on the console, once a name, instead of painting nothing in silence. The issue tracker used a `surfaceRaised` that no theme has, in six places; none of them ever painted.
- db1a6a1: A wrapping row's minimum height is all its lines, not its tallest item. In a column beside a sibling that grows, a wrapping row (a filter bar of chips, say) was squeezed to its first line and the rest spilled out over whatever came next. CSS counts every line, and so does this now.

## 0.4.2

### Patch Changes

- d27e076: **The wheel scrolls an editable that overflows.** A multiline field with a fixed
  height, or an unwrapped one narrower than its line, followed the caret and
  nothing else: a wheel over it did nothing. It now scrolls the field's text on
  either axis, clamped where the caret-follow offset is and without moving the
  caret, and a wheel the field has no room for chains to the scroll container
  around it, as one from a scroll container's end does.

  A multiline field also shows the overlay scrollbar a scroll container does,
  fading when idle, revealed by hovering its edge, and draggable once it shows.
  While hidden it takes no presses, so a click at the end of a line still places
  the caret. A single-line field draws none.

  `scrollRange(record, axis)` is the furthest a record can scroll, the one answer
  the layout engine's clamp, the scrollbars and the scroll sinks now all read.

- d6c52da: **`scrollWith`: a container that scrolls in step with another node.** Binding a
  container's `scrollY` to what `scrollPosition` reports leaves it a frame behind,
  because the report arrives after the frame is laid out. A line-number gutter
  beside a field, or a row header beside a grid, has to line up on every frame.
  `scrollWith` names the node to follow and `scrollWithAxis` the axes (`both` by
  default); the follower takes the leader's effective offset in the same layout
  pass that settles it, whatever moved the leader. It ignores its own offset on a
  followed axis, shows no scrollbar, and passes a wheel over it to the leader. An
  `overflow="hidden"` box that follows is scrolled all the same, as script scrolls
  one in CSS.

  `scrollPosition` on an `<editabletext>` reports how far the field has scrolled
  its own text, from the wheel, its scrollbar, the caret or a clamp.

## 0.4.1

### Patch Changes

- **Scroll layers: a scrolled container is shifted, not redrawn.** On Canvas2D,
  when a frame's only change is a scroll container's offset by a whole number of
  device pixels, the renderer copies the pixels it already drew inside it over by
  the scroll distance and redraws only the strip that came into view —
  pixel-for-pixel identical to a full redraw, and several times cheaper in
  software rendering. A layer is built only after the container has scrolled on a
  few quiet frames running (`scrollLayerSettleFrames`, default 3), so a
  virtualised list that mounts rows as it scrolls never builds one. Anything else
  — a fractional smooth-wheel offset, a zoom, content that changes as it scrolls,
  a caret or video inside — is drawn directly as before.
  `Canvas2DRendererOptions.scrollLayers` turns it off. WebGPU is unchanged.

  **Pictures that change every frame are no longer rasterised every frame.** On
  Canvas2D, a painter's recording whose drawing changed this frame is replayed
  straight onto the frame and rasterised only once it has held still for four
  frames, so a live layer is never turned into a bitmap it throws away. A picture
  seen for the first time, resized or re-themed is still rasterised at once.
  `PaintStats` counts the replays as `direct`.

  **A held mouse click is still a click.** A mouse press held past the long-press
  delay lost its Click, so a deliberate, slow press on a button did nothing. A
  mouse long press is now claimed only when a listener takes it (`preventDefault`
  on `LongPress`) or it moves into a Drag. A finger's hold is claimed as before.

  **`overscrollBehavior="contain"` keeps the wheel in a mounted app.** It was read
  from the tree's topmost node, which in a mounted app is the runtime's wrapper,
  not the app's root, and mid-chain it was honoured only on scroll containers. It
  is now honoured on any ancestor of the target, so a pan-and-zoom canvas can keep
  a ctrl-wheel or trackpad pinch from zooming the page.

## 0.4.0

### Minor Changes

- **`DoubleClick`, dispatched after a second Click on the same node.** The pointer
  controller pairs Clicks on the same node within 500 ms and 4 px — the window the
  editing and selection controllers already use for a word — and dispatches
  `DoubleClick` after the second, as the DOM's `dblclick` follows its `click`. A
  press that became a drag or was cancelled spends the pair.

  `onDoubleClick` on any element; `fireEvent` gains `doubleClick` and
  `contextMenu`.

- **A menu opened at a point stays on the screen.** A context menu's point was a
  top and a left and nothing more, so a menu asked for near the bottom or right
  edge opened off the screen.

  The layout engine gains `anchorPoint`, a point placed beside as an anchor of no
  size would be — the same flip and clamp — and overlays a `point` option that
  uses it. `Menu`'s `at` opens below and to the right of the point, and above or
  to the left when there is no room.

  Found by a spreadsheet's status bar, whose menu opened below the window.

### Patch Changes

- **An absolute box past its containing block keeps its explicit size.** With no
  room left on an axis, the loose constraint an absolute child was measured under
  came out `(0, 0)`, which reads as tight, and a box with an explicit width or
  height was laid out at zero on that axis — where one pixel of room would have
  left it whole.

  An explicit size is the box's own, as in CSS; the block no longer caps it.

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

## 0.3.0

### Minor Changes

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

- 025321a: **A finger can scroll a surface on both of its axes.** `UiTouchScroller` picked one
  axis per container from its flex direction, exactly as `UiWheelController` did
  before it was fixed, and dropped the other. So a viewport whose content overflows
  in both directions — a spreadsheet's, which is one `ScrollView` over content wider
  and taller than itself — could not be dragged sideways at all.

  Each axis is now asked separately whether the container has room, through a
  `hasScrollRoom` the wheel and the touch paths share rather than write twice, so
  the two cannot drift on which container takes a gesture. A fling coasts per axis
  and each axis passes the threshold on its own, so a diagonal throw coasts on both
  and a vertical one does not drift sideways by whatever the thumb happened to do.

## 0.2.1

## 0.2.0

### Minor Changes

- be07839: **A clip can be driven now.** `videoSource` sealed its playback inside a
  closure, so a video was two booleans: `loop` and `autoplay`, and no
  pause, no seek, no rate, and no way to read where it was. Anything that
  wanted a transport had to supply a `VideoResolver` of its own and drive
  the position itself.

  `VideoTransport` arrives through `onReady`, because a playback does not
  exist until a file has been fetched and a decoder configured, and a
  modifier attaches long before either. It carries `play`, `pause`,
  `seek`, `setRate`, `setVolume`, `setMuted` and `retry`, and the
  position, duration and state to read back.

  Nothing on it is reactive, deliberately. `gesso-core` has no cells, so
  it reports through `onChange` and the tier above wraps it in whatever
  its own state primitive is. `onChange` does not fire as the position
  moves: that happens on every frame of every clip, and a listener woken
  sixty times a second to move a scrubber by less than a pixel is how a
  video costs an application its frame budget. Read the position on the
  frames you are already drawing, or extrapolate it as `VideoControls`
  does, at ten a second.

  **A clip scrolled out of view stops decoding.** A hidden tab already
  stopped one, at the animation driver, but within a visible page nothing
  did, so a page of clips cost the sum of all of them however few were on
  screen. It never seeks, so coming back into view resumes rather than
  reloads, and a box laid out to nothing counts as not measured yet
  rather than as hidden.

  **This is the minor, and it is one line of it.** `UiModifierHost` gains
  a required `viewportBox()`, which is what the visibility rule is built
  on. A modifier receives a host rather than implementing one, so an
  application is unaffected; anything that implemented the interface
  itself has one method to add. The budget that interface documents is
  deliberately narrow, and the case for widening it is that a decoder, a
  poller, or anything else that costs whether or not it is looked at has
  no business running for a node a thousand pixels off the bottom.

  `VideoClock` is the seam for a clip whose time belongs to something
  else. Video drops frames and nobody can tell; audio can neither drop
  nor resample without being heard, so where the two must agree the sound
  leads and the picture follows. It is a seam rather than an
  implementation because `AudioContext` does not exist on a worker.

### Patch Changes

- be07839: **A 24fps clip played at 20 on a 60Hz display**, dropping one frame in
  six, for ever, on the commonest clip rate there is.

  An animation that declares `stepMs` is declaring a rate, and the driver
  was treating it as a gap between samples. Frames arrive on the
  display's refreshes, so a sample is nearly always served a little after
  it was due; measuring the next step from when it was _served_ rounds
  the period up to a whole refresh and then keeps the rounding. 41.67ms
  wanted, the refresh at 33.3ms too early, the one at 50ms serves it, and
  the next step measured from 50. The period is not 41.67ms but 50ms.

  The ideal time now advances by exactly `stepMs`, so the served times
  alternate between 33.3 and 50 and average out to the rate that was
  asked for. A rate that divides the refresh exactly was never in
  trouble, which is part of why this went unnoticed: 30fps on 60Hz was
  always right.

  Falling a whole step behind resynchronises rather than catching up. A
  stall or a hidden tab leaves a backlog whose samples are, for a video,
  pictures already past.

  None of this touches a value. A tween's output has always been a pure
  function of elapsed time, so nothing was shown at the wrong moment;
  what was wrong is how often anything was shown at all, which no
  assertion about values could have caught.

- be07839: **A clip you can seek, and a file you need not hold all of.** The media
  tier could play a looping clip from the beginning and not much else.

  A seek was a rewind: going backwards reset the decoder to sample zero,
  so reaching three quarters of the way through a clip decoded the other
  three quarters first. It now starts at the sync sample covering the
  target and throws away the frames between, so the cost of a seek is one
  group of pictures. Measured in a browser at 13 to 22ms for a 1280x992
  H.264 clip on a software decoder.

  **Presentation times are rebased to zero**, which sounds like
  housekeeping and was a clip that would not show its first frame.
  Anything encoded with B-frames has its first picture a reorder depth
  into the file: a six second clip at 24fps reports 6.083s and has
  nothing at all due at position zero. `present(0)` therefore found no
  frame, and since a paused clip never asks again, a still stayed blank
  for ever. Playing clips hid it by advancing past 83ms within two
  frames.

  Converting a decoded frame to a bitmap is asynchronous, so `present`
  returns having chosen a frame that is not drawable yet. The surface now
  says when one actually lands, through `VideoPlayback.onFrame`. Without
  it a scrub on a paused clip moved the scrubber and left the picture
  where it was.

  **Fragmented MP4 is read**, out of `moof`/`traf`/`trun` with defaults
  from `trex`, which is what a DASH or HLS segment is. Audio tracks are
  read too, through `demuxMp4Audio`, so a player can know whether to
  offer a mute button, though nothing here plays one. AV1 and VP9 codec
  strings are assembled from their configuration records rather than
  guessed: `av01` on its own is not a codec string, and a file reported
  that way never played at all.

  **A file need not be held whole.** `DefaultVideoResolver` takes a
  `fetchRange` as well as a `fetch`, and they are two products rather
  than a fast path and a slow one: a fifteen second loop is simplest held
  in one buffer, and an hour of video is a gigabyte nobody will watch all
  of. Given ranges, the resolver walks the top-level boxes to find the
  `moov` whether it is at the front of the file or the back, and media
  follows the decoder through `ByteSource`, whose `read` is synchronous
  and may answer null because the decoder is fed from inside a frame.

  `parseWebVtt` and `cueAt` read a caption track. They never throw: a
  caption file is content, usually someone else's, and one malformed cue
  in a hundred is not a reason to show none of them.

- be07839: **The render worker asks the compositor itself.** `UiHostFrameClock`
  was built on a premise that expired: that `requestAnimationFrame` is
  tied to the compositor and exists only on the main thread, which is why
  the shell ran a loop and forwarded a tick per refresh.

  `DedicatedWorkerGlobalScope.requestAnimationFrame` has been in Chrome
  since 69, Firefox since 99 and Safari since 16.4, which made it
  baseline in March 2023. Measured in a render worker: a median interval
  of 16.70ms with a range of 16.6 to 16.8, which is vsync and not a
  timer. Its timestamps are on the worker's own `performance.now()`
  timeline, so nothing needs translating.

  Counting `requestAnimationFrame` calls on the main thread over three
  seconds: **180 before, 0 after.** The shell is out of the frame path
  entirely, and with it goes the part of the design that was least
  defensible, that a worker's heartbeat depended on the thread the worker
  exists to be independent of. A blocked page used to stop the render
  worker's frames until a stall watch noticed.

  The forwarded path stays, feature-detected, for an older browser and
  for a nested worker on Chromium, which has no frame callback of its
  own. The contract is the same either way. Both stop for a hidden tab,
  which is not luck: a worker's animation frames are serviced by its
  owner window's rendering, and a window that is not rendering services
  none.

## 0.1.0

First public release.

The engine: the retained UI graph, typed properties and dirty flags; a layout
engine covering flexbox in full, CSS Grid with typed tracks, absolute, relative
and sticky positioning and overflow; one paragraph algorithm shared by the
engine and both renderers; `Canvas2DRenderer` and `WebGPURenderer` behind one
`UiRenderer` interface; pointer, wheel, keyboard, focus, gesture and
hit-testing input; and `UiEnvironment` for typed, scoped, reactive theming.

Layout is checked against headless Chrome: 239 generated cases agree within
0.1 px, with the divergences that remain pinned by name. Text breaking is
checked the same way across 124 paragraphs in seven faces, including CJK,
Arabic, Hebrew, Devanagari, Thai and emoji.

`engine.explain(node)` answers why a box is the size it is, in sentences, in
the order the rules applied.

Also in this release: the half of the accessibility mirror that lives below a
component. `UiEditingController.replaceText` is new, so a value set by an
assistive technology arrives as ordinary editing.
