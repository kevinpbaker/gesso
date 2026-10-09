# gesso-components

## 0.6.14

### Patch Changes

- gesso-core@0.6.14
  - gesso-framework@0.6.14

## 0.6.13

### Patch Changes

- Updated dependencies [0020afa]
  - gesso-framework@0.6.13
  - gesso-core@0.6.13

## 0.6.12

### Patch Changes

- gesso-core@0.6.12
  - gesso-framework@0.6.12

## 0.6.11

### Patch Changes

- Updated dependencies
- Updated dependencies
  - gesso-core@0.6.11
  - gesso-framework@0.6.11

## 0.6.10

### Patch Changes

- `TextInput` and `TextArea` take `labelHidden`, as `Select` does: the label still names the field for a screen reader but is not drawn above it, for a search field whose placeholder already says what it is.
- gesso-core@0.6.10
  - gesso-framework@0.6.10

## 0.6.9

### Patch Changes

- Updated dependencies [7af6f56]
  - gesso-framework@0.6.9
  - gesso-core@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [a7bb34e]
  - gesso-framework@0.6.8
  - gesso-core@0.6.8

## 0.6.7

### Patch Changes

- Updated dependencies [6493881]
- Updated dependencies [4f622ec]
  - gesso-framework@0.6.7
  - gesso-core@0.6.7

## 0.6.6

### Patch Changes

- `Menu` and `Select` close before acting on a choice. A choice that opened a dialog — a context menu's Rename…, a select's "another value…" — ran while the menu or list was still open: its focus trap was released after the dialog had taken its own, which popped the dialog's and left the keyboard nowhere, and `Menu`'s close went unreported, so `onOpenChange(false)` never came, the caller's `open` stayed true, and the next right-click only closed the menu. The menu or list now closes, reports it, and gives focus back first, and the choice is acted on after.
- gesso-core@0.6.6
  - gesso-framework@0.6.6

## 0.6.5

### Patch Changes

- e93e0ee: A `Link` can now name an in-app destination with `to`, and a Cmd-click opens it somewhere new, the way a browser treats an anchor. `to` takes one of the application's own urls (`/epic/BUD-12?story=BUD-13`) or a `RouteTarget` from `to(route, params)`. A plain click, Enter or Space runs `onPress` and then navigates the router in place. A click with Command or Control held (either one, on any platform), a middle click, or Cmd-Enter / Ctrl-Enter runs `onPress` and then asks the shell to open the app at that url somewhere new, leaving the current screen where it is. An `href` link is unchanged: it opens through `openUrl` however it is clicked. When a link has both, `to` wins. `Breadcrumb` items take the same `to`.

  The request is the new `ShellService.openRoute(url)`, and what "somewhere new" means is the shell's decision. `createApp` and `GessoApp` take an `onOpenRoute(url)` for a host with its own idea of a new tab, such as an app inside Jira opening one through Forge's `router.open`. Without one, a browser shell opens a tab at the app's own address for that url: the path on the same origin in `path` mode, the same page with the fragment set in `hash` mode. In `memory` mode there is no address, so the link is followed in place. A handed-in `ShellHistory` can answer the new optional `href(url)` to give the address itself; without it, such a link is also followed in place.

  In `gesso-electrobun`, the view bridge has `openRoute(url)` to pass as `onOpenRoute`, and `createDesktopApp` answers it by opening a new window of the application at that route: `openWindow({ route })`, and an `onOpenRoute(url, window)` option to do something else. A window learns its route from the page it loads: `open` reads `window.route`, `withWindowRoute` puts it in the view url's fragment, and `windowRoute()` reads it back as the window's starting url. An `open` that ignores it keeps working. The Electrobun template does all three.

- Updated dependencies [e93e0ee]
  - gesso-framework@0.6.5
  - gesso-core@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [2f6a858]
  - gesso-framework@0.6.4
  - gesso-core@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies
  - gesso-core@0.6.3
  - gesso-framework@0.6.3

## 0.6.2

### Patch Changes

- gesso-core@0.6.2
  - gesso-framework@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [45f3ffe]
  - gesso-core@0.6.1
  - gesso-framework@0.6.1

## 0.6.0

### Minor Changes

- bf21b17: A `Dialog` dims the page behind it, as a browser draws `<dialog>::backdrop`. Palettes have a new `scrim` token, a colour with alpha: the light page's ink at 40% in `lightColors`, black at 60% in `darkColors`, and left alone by high contrast. A custom palette written out in full needs one. Overlay entries take `scrim`, on by default for a `modal` entry and off for every other, so a menu or a list of suggestions never dims the page; the scrim takes its theme from the entry's `environment` and fades in at a dialog's pace, or appears at once under reduced motion. `Dialog` takes `scrim={false}` to leave the page undimmed; its backdrop still keeps the page from presses.
- feaf755: `SplitPane` takes `show`: `'both'` (the default), or `'first'` or `'second'` to put one pane on the whole container. The other is hidden, not unmounted, so its scroll, focus, drafts and any dialog it opened are still there when it comes back. An app that swapped a split for a single pane on a narrow window, or when its sidebar was put away, had to build the page again, which closed a dialog open over it.

### Patch Changes

- 684b59a: A `Dialog` that can't be dismissed now keeps the page from presses, as one that can does: every dialog has a backdrop over the whole page, positioned panels with a `zIndex` included, and `dismissible` decides only whether a press or a wheel on it closes the dialog. Before, a dialog with `dismissible={false}` had no backdrop, so a press beside it reached a button in the page under the modal. Overlay entries take a new `modal` option for the same backdrop.
- e4d2483: A `Dialog` taller than the screen now fits inside it, with 16 pixels to spare top and bottom, as a browser's modal `<dialog>` does: the title and description stay in view and the body scrolls what doesn't fit. Content that can shrink, such as a scroll view with a height and `minHeight: 0`, is given the room there is instead, and a focus ring at the body's edge isn't clipped. A tall form in a short window used to run off the top and the bottom.
- c30f60c: A dialog open from the moment it mounts takes the theme it was declared in. It opened before its placeholder was in the tree, inherited no theme, and drew in the light palette over a dark page; an opening asked for before mount now waits for it.
- 820aee8: Everything that measures a node against the canvas now takes the `transform` of every ancestor into account, as painting and hit testing always have. Under a panned and zoomed parent (cards on a map inside a "camera" box) several things used to work from where the node would be drawn at zoom 1 with no pan:

  - A press from the accessibility mirror or an automation tool, and Enter or Space on a focused button, now click the centre the node is drawn at rather than a point that could be off the node entirely.
  - A modifier's `layoutBox()` and the box `onLayout` reports are the drawn box, so a slider, split pane or colour picker on a zoomed card turns a press into the right value, and `onLayout` hears when a pan above the node moves it on screen. Its size is the drawn size, so a fraction of it stays a fraction; `flowBox()` keeps the laid-out size, and the motion pivot, `breakpoint`, `sizeContainer` and `publishInset` now read that, so a zoom neither shifts a pivot nor crosses a breakpoint. The new `measureFlow` modifier is `measure` for the laid-out box; a virtual list's reveal and a `DataTable`'s sticky header use it, so they scroll by the right amount under a zoom.
  - The caret rectangle handed to the shell, which positions the hidden text field and the IME candidate window, follows the caret where it is drawn.
  - A press beside the fields of an editing group, a drag across them, and a text selection dragged past the end of a line find the field or line nearest the pointer on screen.
  - The mirror's box for a focused node that is scrolled out of view, and the layout inspector's highlight and heatmap, are drawn over the node where it is.

  `LayoutEngine.screenBox(node, part?)` takes an optional rectangle in the node's own coordinates and answers where that part of it is drawn. `EditingHost` and `SelectionHost` take an optional `screenBox`; a host without one behaves as before. With no transform above a node, every answer is the same as before.

- 2486523: A `Select` gives way in a row with less room than its value needs, as a text field does: its least width is nothing, and its value is cut short with an ellipsis before the chevron. Its value used to set its minimum width, so in a narrow row (a phone, or a window zoomed to 400%) a select showing a long value ran past the row's edge. A `minWidth` passed in still wins.
- Updated dependencies [bf21b17]
- Updated dependencies [684b59a]
- Updated dependencies [3b20918]
- Updated dependencies [e9f86a2]
- Updated dependencies [b0233fa]
- Updated dependencies [013e064]
- Updated dependencies [a81d551]
- Updated dependencies [820aee8]
- Updated dependencies [cc9e62b]
- Updated dependencies [684d68a]
  - gesso-core@0.6.0
  - gesso-framework@0.6.0

## 0.5.1

### Patch Changes

- 77195a4: Two more semantics properties, for a field that opens a list of suggestions. `controls` is a relation, like `activeDescendant`: the node this one shows or changes, such as the list a combobox's field has open, held on the record as that node's id and written by the mirror as `aria-controls` naming its element. `autocomplete` (`'list' | 'inline' | 'both'`, the new `UiAutocomplete`) says what a field offers as it's typed into, written as `aria-autocomplete`. The editing proxy writes both while a field has focus, so `EditingMirrorTarget.describe` takes the controlled element's DOM id after the active descendant's. `Combobox` uses them: its field controls the list while it's open, and its autocomplete is `list`.
- 3896cea: A `Dialog` wider than the screen now fits inside it, with 16 pixels to spare each side: `width` is the width it takes where there's room, and on a phone it narrows to the screen. A 520 pixel dialog on a 375 pixel phone used to run off both sides, title and all.
- 28a971e: `MenuBar` takes `checkedOf`, for commands that are settings rather than actions. True draws a tick beside the label and false leaves its place empty; a menu with any setting in it keeps the tick column on every row so labels stay aligned. Those rows are `menuitemcheckbox` with the `checked` state, so a screen reader says whether the setting is on. Undefined, or no `checkedOf` at all, keeps a plain `menuitem` as before.
- 6b71716: An overlay can open beside a part of its anchor: `anchorRect` on an overlay entry (and on `useOverlay`'s options), and the layout property of the same name, is a rectangle in the anchor's own coordinates that the entry is placed against, with the same flip and shift, and that it follows through scrolling and layout as it follows the anchor. It can be an Observable, so it moves without the entry opening again. `EditingService.caretRectOf(node, offset)` (and `UiEditingController.caretRectOf`) answers for a character other than the caret's, so a list opened by `@` sits under the `@` as the name is typed, and goes to the next line with it when it wraps. A point opened beside the caret stayed behind when the page scrolled.
- Updated dependencies [77195a4]
- Updated dependencies [6b71716]
- Updated dependencies [581cf89]
- Updated dependencies [13c096f]
- Updated dependencies [db7040b]
  - gesso-core@0.5.1
  - gesso-framework@0.5.1

## 0.5.0

### Minor Changes

- d1fec43: `Button` takes `tabStop`, default true. False leaves the button out of the Tab order while a press, a screen reader and `focus()` still reach it: for a button that is the pointer's way to something the keyboard already has a key for, such as Previous and Next beside a page's j and k.
- 5cae4b4: A `Combobox` can search somewhere else: `onQueryChange` hears the text as it's typed, and `filter={false}` shows `options` as given, already narrowed by the search, for a list too long to hand the component.
- 08a7c30: `Combobox`: a value chosen by typing, a text field that filters a list. One value by default, several with `multiple` (each choice toggles one, the list stays open, chosen values sit in the field before its text, with remove buttons, and Backspace in the empty field takes the last off). Matches rank a label's start, then a word's start, then anywhere, then a keyword; `filterCombobox` is the same ranking, exported. Focus stays in the field while the highlight walks the list, which the field names as its `activeDescendant` so a screen reader follows it, and the list scrolls to keep the highlight in view.
- 23b26f6: A `DataTable` hands each cell the colour its text should be drawn in, as the third argument to a column's `cell`: the control foreground, or the selection foreground while the row is chosen. The table set that colour on the row before, and `color` does not cascade from a parent node, so it reached no cell; a chosen row's text kept the default colour on the selection background, and in a dark theme the cells were black on a dark table. Bind it with `cell: (row, index, color) => <text text={...} color={color} />`. A cell that ignores it keeps the colour it names, as before.
- a0b5560: `DatePicker`: a calendar date chosen from a month, held as a `YYYY-MM-DD` string so no time zone can put it a day out. The trigger shows the date in the reader's language and opens a calendar dialog whose grid of days holds focus, with the day under the cursor as its `activeDescendant`. Arrows move a day or a week, Home and End the week's ends, PageUp and PageDown a month (Shift, a year), Enter chooses, Escape closes. `min` and `max` bound it, `weekStart` and `locale` shape it, and `today` pins the date that counts as today. The date arithmetic is exported: `parseIsoDate`, `isoDate`, `todayIso`, `addDays`, `addMonths`, `monthGrid`, `formatDate`.
- 47aba08: The stock theme is drawn the way current interfaces are. Text is set in `system-ui, sans-serif`, the platform's own face, on line heights from a 4-point grid (body is 14 on 20, not 14 on 16.8), and in a blue-black ink rather than black. The palettes use cool-tinted neutrals and a deeper accent, so white on `primary` and `controlAccent` clears WCAG AA, which the old bright blue did not; every stock text pair in both palettes is now held to AA by a test. A medium button is 36 high with 16 either side. Select, DatePicker, Accordion and Tree draw their disclosure arrows as Heroicons chevrons rather than as `▾` and `▸`, which every face set at a different size. An application on the stock theme reflows: text that names no size is taller, and a layout measured against 16.8 moves. A theme that sets its own typography and palette is unaffected except for the button padding, which is a `controlTokens` value it can set back.
- ede6717: `Toast` takes an `action`: the text of a button that acts on the notice, such as Undo, calling `onAction` and closing the toast when pressed (the timer closing it doesn't call it). `placement` (`'bottom-start'`, `'bottom'` or `'bottom-end'`) and `offset` move where on the bottom edge it is pinned, so it can clear a toolbar or a panel an app keeps along the bottom of the window.

### Patch Changes

- a8ee079: A `Combobox` with `multiple` names its chosen values from the options as they are now, so values set before the options arrived (from a channel, say) are named when they do; they showed as nameless chips. The chosen values sit inside the field's box, before the text, wrapping as more are added, and the box shows focus.
- 7e76ada: A `Combobox`'s list is as wide as its field and sits under it; it took the width of the whole overlay layer, the window's, and was pushed to the left edge. Focusing the field with a press now selects the chosen label as focusing it from the keyboard does, so typing starts a new search instead of adding to the name.
- be422e9: A `Dialog`'s content is as wide as the dialog, inside its padding. The column holding it sized itself to its content, so a form asking for 100% got the width of its title, and a 600-pixel dialog drew its fields in the left half.
- 6d141a5: `Select`'s type-ahead consumes the keys it uses, so a page's single-letter shortcut on the same key no longer runs as well. With the list open every printed character is the list's; closed, only a letter that picks an option is. A key held with Ctrl, Cmd or Alt is never type-ahead.
- e08325a: `SplitPane`'s divider no longer shrinks, and its second pane takes the space the first one leaves without being measured for it first. When a pane's content was wider than the track, the divider gave up most of its six pixels (it could be drawn 1 px wide), and it gave up a different amount for every content width. So every keystroke in a pane moved the pane by a fraction of a pixel and re-measured everything in it.
- 316da44: A `Tabs` given a height gives its panel the height the tab list leaves, and stretches the panel's child to fill it. Before, the panel stayed as tall as its content, so a tree or a scrolling list inside a sidebar of tabs could neither fill the column nor scroll within it.
- e958805: A `Toast` declared already open takes the theme of the tree it's declared in. It used to open before its placeholder was in the tree, with nothing to take a theme from, so a toast mounted afresh for each notice drew in the light theme on a dark app; it now waits for the placeholder.
- f02740f: A tooltip opens for focus the keyboard can see and not for the focus a press gives, so clicking a button no longer leaves its tooltip over whatever the click opened. A tooltip whose element is removed closes with it, even while the component that rendered the element stays, as when a Run button turns into Cancel. The `Tooltip` component now follows keyboard focus anywhere inside its wrapper, which it could not before because a focus event does not bubble. `FocusService.focusVisible` says whether the focus held is focus the keyboard can see.
- 819df79: A `Tree` draws its labels and arrows in `controlForeground`, and a chosen row's in `selectionForeground`. The colour was set on the row, and `color` does not cascade from a parent node, so the text drew in the text style's colour instead: black, in a dark theme as in a light one, which left a dark tree's labels nearly invisible.
- Updated dependencies [5a27b40]
- Updated dependencies [f265910]
- Updated dependencies [d36a2fa]
- Updated dependencies [c38f97e]
- Updated dependencies [b90ecb2]
- Updated dependencies [8d25c04]
- Updated dependencies [20ac739]
- Updated dependencies [303e85a]
- Updated dependencies [96f4bdc]
- Updated dependencies [0f02fc2]
- Updated dependencies [88d93b3]
- Updated dependencies [dc7f199]
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
- Updated dependencies [8c1b8ed]
- Updated dependencies [5b3508d]
- Updated dependencies [fe0c1e0]
- Updated dependencies [2ce079c]
- Updated dependencies [b502e0e]
- Updated dependencies [be3e274]
- Updated dependencies [2bfedcd]
- Updated dependencies [979053a]
- Updated dependencies [b2dddbc]
- Updated dependencies [ab0c1a6]
- Updated dependencies [80a3577]
- Updated dependencies [1dfb6c2]
- Updated dependencies [47aba08]
- Updated dependencies [99538fa]
- Updated dependencies [fb2a6d8]
- Updated dependencies [28f5b72]
- Updated dependencies [94a9f13]
- Updated dependencies [427ce99]
- Updated dependencies [b7c9514]
- Updated dependencies [d3ab865]
- Updated dependencies [0bef08b]
- Updated dependencies [aa33728]
- Updated dependencies [af33f45]
- Updated dependencies [6d51def]
- Updated dependencies [8c4f475]
- Updated dependencies [93d580b]
- Updated dependencies [1d61bae]
- Updated dependencies [68b01e0]
- Updated dependencies [5d67836]
- Updated dependencies [acad77f]
- Updated dependencies [444371c]
- Updated dependencies [62883e0]
- Updated dependencies [d617d34]
- Updated dependencies [6f03f61]
- Updated dependencies [2c572e3]
- Updated dependencies [84fe6d5]
- Updated dependencies [e73a5fc]
- Updated dependencies [1de054a]
- Updated dependencies [f02740f]
- Updated dependencies [9341d31]
- Updated dependencies [2e3e56d]
- Updated dependencies [cf3b16a]
- Updated dependencies [5b59d13]
- Updated dependencies [db1a6a1]
  - gesso-core@0.5.0
  - gesso-framework@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [d27e076]
- Updated dependencies [d6c52da]
  - gesso-core@0.4.2
  - gesso-framework@0.4.2

## 0.4.1

### Patch Changes

- **`ColorPalette` and `ColorPicker`.** `ColorPalette` is a colour chosen from a
  grid, anchored to whatever opened it and built as `Menu` is: the caller owns the
  trigger and whether it is open, and the palette owns the keyboard while it is.
  Rows of greys then ten hues from light to dark, each swatch named for a screen
  reader; an optional no-colour choice ('Automatic', 'No fill') and a row of recent
  colours above the grid; it opens on the current colour, ringed. `onCustom` adds
  'Custom colour…' at the foot of the grid.

  `ColorPicker` picks any colour at all: a saturation/brightness square, a hue
  bar, and a `#rrggbb` field that takes one typed or pasted. It is a panel, so its
  holder decides when it shows; `onChange` is told on every move, the square and
  bar take the arrows (Shift for a bigger step), and a grey keeps the hue somebody
  was on. `normalizeHex`, `hsvOfHex` and `hexOfHsv` are exported alongside.

  A hovered swatch keeps its own colour: hovering moves the ring, as the keyboard
  does, rather than washing the swatch grey.

- Updated dependencies
- Updated dependencies
  - gesso-core@0.4.1
  - gesso-framework@0.4.1

## 0.4.0

### Minor Changes

- **A compact `Select`, and one whose label is not drawn.** For a `Select` inside
  a line of text or a toolbar row, not on a form.

  With `compact`, the trigger and its list use 12px text and a trigger no taller
  than a field beside it. With `labelHidden`, the label stays the control's name
  but is not drawn above it, because the words around it already say what it is
  for.

- **A menu opened at a point stays on the screen.** A context menu's point was a
  top and a left and nothing more, so a menu asked for near the bottom or right
  edge opened off the screen.

  The layout engine gains `anchorPoint`, a point placed beside as an anchor of no
  size would be — the same flip and clamp — and overlays a `point` option that
  uses it. `Menu`'s `at` opens below and to the right of the point, and above or
  to the left when there is no room.

  Found by a spreadsheet's status bar, whose menu opened below the window.

- **A tooltip's text may be a function, asked each time it opens.** For a label
  that follows the application — "Undo sort" rather than "Undo" — without
  rebuilding the element it is attached to.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-core@0.4.0
  - gesso-framework@0.4.0

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

- Updated dependencies [025321a]
- Updated dependencies [025321a]
- Updated dependencies [025321a]
  - gesso-framework@0.3.0
  - gesso-core@0.3.0

## 0.2.1

### Patch Changes

- ebe7da3: **The video controls take themselves away again.** They appeared on
  hover and vanished the moment the pointer crossed the edge, which is
  not what a player does and is wrong in both directions.

  A pointer that entered and then stopped is not using the controls, so
  the bar now goes after a second of stillness whether the pointer is
  still inside the clip or long gone. A pointer that has just left is
  very often coming straight back, and hiding the instant it crosses the
  edge made the bar flicker under a hand reaching for it, so leaving
  starts the same countdown rather than hiding at once.

  Resting on the bar suspends the countdown entirely, and has to: a hand
  held steady over a scrubber it is about to press is the stillest the
  pointer ever is, and exactly when an idle timer would otherwise fire.

  `hideAfterMs` sets the delay and defaults to a second. Zero keeps the
  bar up until the pointer leaves, and `alwaysVisible` still pins it.

- gesso-core@0.2.1
  - gesso-framework@0.2.1

## 0.2.0

### Patch Changes

- fbedd4e: `Alert` is a new component: a persistent inline banner for a message
  that belongs to a region rather than to the screen. The trial notice
  above a settings page, the declined-card line above a payment form, the
  note over a list saying these numbers are an hour old. A `Toast`
  appears, says its piece and leaves on a timer; an alert is still there
  when you come back to it.

  It takes a `title`, a `message`, one of three tones, and an optional
  `onDismiss`. The tones are `neutral`, `accent` and `danger`, the same
  three `Badge` and `Chip` carry, and there are three because the palette
  has three: there is no `success` token and no `warning` token, and a
  banner is not allowed to name a colour your theme has not given it. If
  you want a green banner, theme `controlAccent` or wrap the banner in a
  theme provider of its own.

  The tone is carried by the banner's edge and the ink of its title, on
  the same `controlBackground` sheet under all three, rather than by a
  filled ground. A full `danger` wall across the width of a region is
  louder than nearly any message that goes in one, and it puts the body
  text on a ground your theme only had to make legible for short labels.

  What it declares is the part worth reading before you use it. `live`
  defaults to true, because a banner that appears is news. A live
  `danger` banner is `role="alert"` with an assertive live region, so it
  interrupts; that is right for a declined card and wrong for everything
  else, so every other live tone is a polite `status`. `live={false}` is
  the standing banner that was on the page at load: a `region` named by
  its title, with no live region at all, so it can be found and skipped
  rather than announced again every time focus goes past. Those three
  props are read once, when the banner is built, because a live region
  has to exist before the text inside it changes; a banner that has to
  change tone or stop being live changes its `key`.

  `onDismiss` draws a real button named "Dismiss", and pressing it calls
  your handler and nothing else. The banner does not remove itself:
  whether it is still in the tree is your conditional, because only you
  know whether dismissing means for this render, this session or for
  good.

- 10fe32d: `Breadcrumb`: the trail of where you are, with the one crumb that is not
  a link.

  `<Breadcrumb items={trail} onSelect={follow} />` draws a `navigation`
  landmark holding a `list` of crumbs, root first and this page last.
  Every crumb but the last is a `link` that reports itself through
  `onSelect` by value. The last one is where you already are, so it is not
  a link, not a tab stop and never reports: a control that navigates to
  the page you are on does nothing when it is pressed, and someone tabbing
  a page cannot tell that until they have spent the press finding out. It
  is distinct to the eye by weight rather than by colour alone.

  `maxItems` folds a trail that is too long. Above 0, a trail longer than
  it keeps its first crumb and its last and folds the middle into one
  crumb, which is a `button` named for the count it hides ("Show 3 hidden
  steps") rather than an ellipsis a screen reader reads as three full
  stops. Pressing it unfolds the trail in place and moves focus to the
  first crumb it revealed, so the keyboard does not fall back to the top
  of the page; a new trail folds again rather than arriving unfolded. A
  menu of the folded crumbs is the obvious next step and is not in this
  change.

  `separator` is what is drawn between crumbs, a solidus by default, in
  `textMuted` and never after the last. It declares a `separator` with an
  empty name, so "Home slash Projects slash Build" is never what a reader
  hears. `label` names the landmark, `Breadcrumb` by default, because an
  unnamed landmark in a list of landmarks leads nowhere. `items` is bound
  rather than read once, since a breadcrumb is the one component whose
  input changes on every navigation.

  Enter and Space both follow the focused crumb, which is what the runtime
  already does for anything whose role is `link` or `button`. An empty
  trail draws nothing and is not in the semantics tree; a trail of one is
  the page you are on and has no links at all.

- 1a1b222: **`Link`, because a link is not a button with different paint.** The
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

- 0f5aedb: **`Meter`, for a measurement rather than a task.** A progress bar is
  about time: it starts empty, it fills, it ends. A disk that is 82% full
  is not on its way anywhere, and drawing it with a progress bar tells
  the reader that something is happening. `Meter` is the read-out for a
  quantity that sits somewhere in a known range and is simply true right
  now: storage used, a password's strength, a budget spent, a battery.

  The feature is the bands. `low`, `high` and `optimum` decide the tone
  the bar is painted in, so the conditional "is this reading good?" is
  written once in the library rather than at every call site.
  `optimum: 'high'` is the ordinary direction, where a value at or above
  `high` is good; `optimum: 'low'` is the disk case, where 5% full is
  good and 95% full is not. Good is `controlAccent`, poor is `danger`,
  and the middle band is `textMuted`. As everywhere else in the library
  those are palette names, and there is no colour prop.

  `showValue` draws the reading beside the bar, and `format` decides how
  it is written, defaulting to a percentage of the range. The formatted
  string is also what an assistive technology hears, through
  `valueText`, so a reader is told "34 GB of 240 GB used" rather than
  "34". A value outside the range clamps the fill and not the reported
  number, and a range whose `max` is not above its `min` draws an empty
  bar rather than throwing, because that range usually arrives from data
  rather than from a typo.

  The role is `progressbar`, which is a narrowing: there is no `meter`
  role in `UiRole`, and it is the only numeric-range role that is not a
  control. The component's page says so, and says which of the two to
  reach for.

- 64f2332: `Pagination` draws the strip of page numbers that goes under a table of
  rows shown a page at a time. Give it `pageCount` and either `page` or
  `defaultPage`, and it reports every move through `onChange`; it holds
  no rows and does no slicing, so the page stays the one number your
  application owns.

  The arithmetic is the component, and two of its decisions are worth
  knowing before you reach for it. It never draws an ellipsis that stands
  for a single page, because a page is the same width as the "…" hiding
  it and can actually be pressed. And the strip does not change width as
  you page through it: at page 1 the run of numbers is as wide as it is
  in the middle, each slot has a floor under its width, and previous and
  next are disabled at the ends rather than removed, so nothing walks out
  from under the pointer that is clicking it. `siblings` sets how many
  numbers sit either side of the current page and `boundaries` decides
  whether the first and last are pinned.

  `paginationItems` is exported beside the component: the same pure
  function, for a strip you are drawing yourself or a test that wants to
  ask what would be drawn without mounting anything.

  What it says is not what it shows. Each numbered control is named "Page
  4" rather than "4", the page you are on carries the `selected` state as
  well as the accent, the ellipsis is decorative and cannot be focused,
  previous and next are named, and the strip itself is a `navigation`
  landmark whose name defaults to "Pagination" and is worth setting
  through `label` on any screen with two of them. There are no colour
  props: the current page is painted from the `filled` and `accent` row
  of the shared button tokens and the rest from `plain` and `neutral`, so
  a theme that restyles its buttons restyles this with them.

- 5aa069f: `SegmentedControl`: one choice from a few, drawn as one track cut into
  segments.

  The control at the top of a pane that says which of three views is
  below it, or which of two units a figure is in. Day / Week / Month,
  Grid / List, Celsius / Fahrenheit: two to five short choices, all worth
  seeing at once, costing one line of a toolbar.

  It declares a `radiogroup` of `radio`s and not a `tablist`, and that is
  the decision the component exists to make. A `tablist` is a promise
  that each control reveals a panel, and an assistive technology acts on
  it; a segmented control that picks Celsius has no panel to send a
  reader to. If the choice really does change which panel is shown,
  `Tabs` is still the component, and it draws the `tabpanel` to go with
  the strip.

  The keyboard is `RadioGroup`'s, deliberately. The track is a single tab
  stop and the segments are not, the arrows walk and walking selects,
  Home and End reach the ends, and every one of them steps over a segment
  marked `disabled` rather than landing on it. It is a separate component
  rather than a `variant` on `RadioGroup` because only the semantics and
  the keyboard are shared: the paint, the layout, the sizing and four of
  the props are not, and a variant prop that turned four other props off
  would be a second component hiding inside the first.

  `size` is a `ButtonSize` and resolves through `controlTokens.button`,
  so a segmented control and a `Button` of the same size are the same
  height, share a radius and set their words in the same type role. No
  colour is a prop: the trough is `controlBackground` inside a
  `controlBorder` ring, and the chosen segment is the selection pair with
  a ring of its own, so which segment is chosen survives greyscale rather
  than resting on colour alone.

  `options` is a cell and the segments follow it, so choices that arrive
  from a request appear when they arrive. An empty `options` draws an
  empty named track rather than nothing, because an empty array is
  usually "not loaded yet" and a control that vanished and came back
  would move everything beside it twice. A `value` that matches no
  option, which is what a stale saved preference looks like, leaves
  nothing chosen instead of being quietly corrected to the first segment;
  an arrow recovers from it.

- be07839: **`Video` gains `controls`**, and with it the transport people expect
  over the bottom of a clip: play and pause, a scrubber, the elapsed and
  total time, a mute and level where sound is wired, and fullscreen. An
  object turns parts off or pins the bar up instead of revealing it on
  hover.

  The bar is not a privilege. `VideoControls` is exported like any other
  component and is `Button`, `Slider` and `Icon` driven through the
  public `VideoTransport`, with no access to the decoder an application
  does not also have. What the prop buys is the default rather than the
  capability, and `controls` is off unless asked for, because a `Video`
  is as often a background or a moving texture as it is something to
  watch.

  The scrubber runs along the top edge of the bar, the whole width of it.
  That is the boundary between the picture and the chrome under it, and
  it is the one control whose length carries meaning, because its length
  is the clip.

  A `Video` with controls is a `group` rather than an `image`. A
  rectangle showing a picture is an image; one that also carries a
  toolbar is a group of things, and announcing it as an image would hide
  the controls behind a leaf.

  **Nothing here plays a clip's sound.** `AudioContext` does not exist on
  the thread that decodes, so the level is state reported through
  `onVolume`, and the volume control is drawn only where that is wired,
  because a level slider over silence is a lie.

  Fullscreen is two things. The shell fills the screen with the canvas,
  because a clip here is pixels on a shared surface and there is nothing
  else to hand the browser; doing only that fills the screen with the
  _application_, the clip still its original size inside it. So the clip
  is also drawn into the overlay layer with every edge pinned, sharing
  one playback with the original because playback is reference counted by
  source.

  `VideoPlayer` is now that with the bar pinned and a caption track over
  it. `Captions`, `parseWebVtt` and `cueAt` are separate because a
  caption track is not a property of a rectangle: it is a second piece of
  content that happens to be synchronised with the first, and a
  transcript beside the video wants the same lookup with none of the
  chrome.

  `Slider` gains `thumb` and `trackAlign`, and `labelHidden` now collapses
  the label's space rather than merely hiding it. The last is a fix:
  `visible` affects paint and semantics and deliberately not layout, so a
  `labelHidden` slider was a track with twenty empty pixels over it,
  which is precisely wrong for the media bar the prop was added for. It
  will tighten any layout already using it.

- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
  - gesso-core@0.2.0
  - gesso-framework@0.2.0

## 0.1.0

First public release.

The component library: inputs, overlays, structure, data and media, against
one contract.

Every control is controlled by default with an optional `defaultX`, themed
through `UiTheme` tokens and taking no colour props, keyboard operable from a
keymap that is data, and emitting semantics from the day it was written.

`label` is one prop for the words and for the accessible name, because in a
button with words they are the same thing.
