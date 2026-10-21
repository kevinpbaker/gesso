# gesso-components

## 0.6.28

### Patch Changes

- 6c4a7cc: Escape in a text field reaches the field when a tooltip is open over it. Since 0.6.27 an open tooltip took Escape for itself, so in a field whose focus opened its tooltip, cancelling an edit took two presses and the first only closed the tooltip. The tooltip still closes on that Escape; the field now hears it as well.
- gesso-core@0.6.28
  - gesso-framework@0.6.28

## 0.6.27

### Patch Changes

- bdc4780: `Button` can be the trigger of a popup. It takes `expanded`, announced as expanded or collapsed as it changes, and `controls`, the node it opens, such as a `Popover`'s panel from `panelRef`. A button given neither says neither, so an ordinary button is not announced as collapsed. A popover's trigger used to have to be a raw `<button>` element to say what it opened; the Popover page and its example now use `Button`.
- bdc4780: `ColorPicker` can pick an opacity. With the new `alpha` prop, a strip under the hue bar fades the colour into a checkerboard, and dragging or pressing it sets how opaque the colour is. It is a slider named "opacity" that reads its value as a percentage, and it takes the arrows like the square and the hue bar: 1% a press, 10% with Shift. The swatch beside the field shows the colour over the same checkerboard, the field takes `#rrggbbaa` and the `#rgba` shorthand as well as the six- and three-digit forms, and `onChange` always reports `#rrggbbaa`. A value without alpha is read as fully opaque. Without `alpha` the picker is exactly as it was: no strip, `#rrggbb` in and out, and an eight-digit value is still not a colour to it.
- bdc4780: Every component's text now takes its size from a role of the theme's typography (`textStyle`) instead of a raw `fontSize`, so a theme that changes its type scale restyles the whole library. Field labels, helper and error text, tooltips, menu bar commands, compact menu and select rows and table headers use `bodySmall` (headers as `label` at weight 600); cell values, tree and navigation rows, toast messages and dialog and drawer descriptions use `body`; a card's heading is `bodyLarge` at weight 600; dialog and drawer titles use `title`.

  There is a small visible change with the stock scale: text that was 13px is now 14px `body`, dialog and drawer titles are 20px rather than 18px, and every moved text takes its role's line height (16, 20, 24 or 28) rather than 1.2 times its size, so some rows and headings are a few pixels taller. Glyphs that are really icons (a tick, a sort arrow, a stepper's − and +, a close cross, a navigation rail's monogram) and an avatar's initials keep sizes of their own.

- 08f3995: `DataGrid` is new: an editable spreadsheet grid of any size, built on `LazySheet`, so a grid of a hundred thousand rows by fifty columns mounts only the cells in view. You give it the columns (a key, a header and a pixel width each, optionally `editable`, `align` and a display `format`), a `rowCount` and a `getValue(row, column)`; it never holds the data, asks only for what is on screen, and reports a committed edit through `onCellChange(row, column, value)`, reading the cells in view again straight after. A `revision` prop re-reads them when the data changes for any other reason.

  The header stays while the rows scroll, and `frozenColumns` keeps columns at the start in view while the rest scroll sideways, on the right under a right-to-left reading. One active cell, controlled through `activeCell` and `onActiveCellChange` or left to the grid with `defaultActiveCell`, is walked with the arrows (mirrored right to left), Home and End, Ctrl or Cmd with Home and End, Page Up and Page Down, and Tab across a row; Tab off the end of a row leaves the grid rather than trapping the keyboard. Enter or F2 edits a cell, typing a character replaces it, Enter commits and moves down, Tab commits and moves across, Escape puts the old value back, and Delete clears it. Cells in columns that are not `editable`, or in a `readOnly` grid, refuse all of these. A click makes a cell active and a double click edits it.

  The grid is announced as a `grid` whose active cell is its `activeDescendant` and is `selected`, with `columnheader` header cells, `gridcell` cells marked `readonly` where they cannot be edited, and rows that give their place in the whole data with `posInSet` and `setSize`.

- ff9dd85: `DataGrid` selects ranges, copies and pastes, and jumps faster.

  A range of cells grows from the active cell with Shift and the arrows, Home, End, Page Up and Page Down (with Ctrl or Cmd for the corners), with a drag across cells, or with a Shift+click; Ctrl+A or Cmd+A selects every cell and Escape collapses the range back onto the active cell. The range is drawn with the theme's selection fill and a border round it, and every cell in it is announced as `selected`. It can be left to the grid, started with `defaultSelection`, or owned by the application through `selection` and `onSelectionChange`, with a `DataGridRange` of two corner cells. Whatever moves the active cell collapses the range onto it, and typing or Enter still edits the active cell.

  Ctrl+C or Cmd+C copies the range as tab-separated text, a line per row, through `ShellService.copyText`, taking the stored values rather than the formatted ones and quoting any value with a tab, a line break or a quote in it. A paste writes a block from the active cell across and down through `onCellChange`, stops at the grid's edges, keeps every read-only cell's value, and selects what landed. Ctrl+X copies and then clears the range's editable cells, and Delete and Backspace now clear every editable cell in the range rather than the active cell alone.

  After a commit, a clear or a paste the grid now reads back only the cell that changed, where it used to read every cell in view. An application whose other cells follow from an edited one (a total) should move `revision` on in `onCellChange`, as the docs example now does.

  Keys typed between the one that opens the editor and the editor taking the keyboard are kept, in order: typing a word quickly over a cell no longer loses its second letter, and an Enter typed in the same moment commits it.

  The grid recycles its rows, so a jump that replaces every row in view (a scrollbar drag down a long sheet, Ctrl+End, an active cell sent far away) reuses the cell nodes instead of building new ones: about 11 ms a frame for a 1200 by 800 grid in the test runtime, down from about 30.

- ff9dd85: `DataGrid` resizes columns, freezes rows, shows row headers, works out formulas, and tells a screen reader where each cell sits in the whole data.

  Columns can be resized by dragging the edge at the end of a header, down to a column's new `minWidth` (40 pixels by default), by double-clicking that edge to fit the column to its widest value in view, or with Alt+Shift and Left or Right on the active cell's column. Under right to left the end edge is the left one, so a drag or Alt+Shift+Left the other way widens it. `onColumnResize(key, width)` reports every new width, and `columnWidths`, a record of widths by key, makes the widths the application's to own. A column with `resizable: false` keeps its width.

  `frozenRows` keeps rows at the top below the header while the rest scroll under them, with a heavier line under the last one. `rowHeader` adds a column of row headers at the start that stays while the rest scroll sideways: `true` numbers the rows, or a function names them, in a column `rowHeaderWidth` wide. A click on a row header selects that row, a Shift+click a run of rows, and a click on the corner above them selects everything. Home and Ctrl+Home now also scroll the columns, and with Ctrl the rows, back to their start, so going home past a frozen pane no longer leaves the sheet scrolled.

  With `formulas`, a value that starts with `=` is worked out as a formula with A1 references by column position and row number, and the cell shows its result through the column's `format` while the editor shows the formula. Every formula in view is worked out again after a commit, clear, cut or paste, and on a new `revision`. Errors are shown by their code in the danger colour, a copy takes a formula's result rather than its text, and each column header shows its letter.

  The grid now says how many rows and columns it has (`rowCount` and `columnCount`, the header row and row headers counted), each row its `rowIndex` and each cell its `columnIndex`, which the mirror writes as `aria-rowcount`, `aria-colcount`, `aria-rowindex` and `aria-colindex`. Rows no longer carry `posInSet` and `setSize`, which belong to the items of a list or tree, not to the rows of a grid.

- bdc4780: `DataTable` takes `revealSelected`, as `LazyList` does. With it, a row the application chooses by writing `selectedRow` (a record opened from a search, a link to one line of a long log) is scrolled into view clear of the sticky header, including a row far from the window that has never been mounted. A row chosen before the table has been laid out is revealed once it has a height. The table follows the row rather than its position, so a sort that carries the chosen row elsewhere does not scroll after it. Without the prop a written row is drawn as chosen and nothing more, as before, and rows reached from the keyboard scroll into view either way.
- ed7b54a: `DatePicker` fixes, all found in the component workbench. Days that `min` or `max` leave out are now disabled while the calendar is open. Before, they were worked out once for each month shown, so moving a bound (a due date's `min` following its start, say) left the wrong days dimmed and announced. The cursor's ring on the chosen day now uses the focus ring colour. It used to be the accent on an accent fill, so it disappeared. In a narrow row the trigger gives way: a long placeholder is cut short with an ellipsis before the chevron instead of running past the border. A value that isn't a real date shows the placeholder muted, the same as an empty one.

  `ColorPicker` now shows a colour typed into its field in the swatch beside the field. Before, the square and `onChange` followed it but the swatch kept the old colour. `width` is now documented as read once, when the picker is built.

  `ColorPalette` rings and opens on the swatch a value names however it is written, so `#F00` finds red the way `#FF0000` already did.

- 08f3995: `Drawer` is new: a panel that slides in from an edge of the window. `side` is `start`, `end`, `top` or `bottom`, with `start` and `end` following the reading direction, so a `start` drawer comes in from the right in right-to-left text and its content is laid out right to left too. `size` is its width (or height for `top` and `bottom`) and is clamped to the window, so a drawer never runs off the far side of a phone.

  It is modal by default: the page is dimmed and kept from presses, a press on the dimmed page closes it, Tab cycles inside it, and closing gives the keyboard back to whatever opened it. It releases only its own focus trap, so it can be opened from inside a `Dialog` and closed under an open `Menu` without taking the keyboard from either. `modal={false}` is a panel beside the page instead: nothing dimmed, nothing trapped, and the page stays usable. Escape closes either while focus is inside it.

  `open` and `onOpenChange` make it controlled, `defaultOpen` lets it own its state, and `onClose` is there under the name `Dialog` uses. It slides in and back out through `AnimationService`, takes no presses or keys while it is leaving, and simply appears and disappears under reduced motion. It is a `dialog` named by its `title` (or `label`), with the `modal` state when modal.

- ff9dd85: A spreadsheet formula engine for the grid, in `formula.ts`, with no dependencies. A cell's raw string that starts with `=` is a formula; anything else is a number when the whole of it reads as one, blank when it is empty, and text otherwise. Formulas take A1 references (`B3`, `$B$3`, `AA10`) and ranges (`A1:C3`), the operators `+ - * / ^ &` and `= <> < <= > >=`, and the functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, NOT, ROUND, ABS, CONCAT, LEN, UPPER and LOWER, in any case. Precedence follows the sheets people already use: `-2^2` is 4 and `2^3^2` is 64.

  `createFormulaEvaluator(resolve)` never holds the data. It asks `resolve(row, column)` for the raw string of only the cells a formula reads, and an `undefined` answer, past the end of the data, becomes `#REF!`. `evaluate(row, column)` gives a cell's value and `display(row, column)` its text; values are kept until `invalidate()`, which a grid calls after an edit or when its data changes, so scrolling recomputes nothing. A running total fifty thousand rows long evaluates without overflowing the stack.

  Errors are values, as in a sheet, and flow through whatever reads them: `#DIV/0!`, `#REF!`, `#NAME?` for an unknown function, `#VALUE!` for the wrong type or number of arguments, `#NUM!` for a result that is not a finite number, `#CYCLE!` for every cell on a circular reference, and `#ERROR!` for a formula that does not parse. They are objects, so text that happens to read `#REF!` is never taken for one. `formatFormulaNumber` shows a number to the fifteen digits a double really carries, so `0.1 + 0.2` reads `0.3`, and `columnLetters`, `columnIndex`, `cellName` and `parseCellName` convert between positions and A1 names.

- cbac578: A `DataTable`, or any `LazyGrid`, whose columns are wider than it is scrolls sideways to reach them. The grid that holds the header and the rows was exactly as wide as the list, however far its tracks ran past it, and a scroll container measures its content by its children's boxes, so the columns past the edge were cut off with nothing to scroll to. The grid is now at least as wide as its fixed tracks, the floors of its `minmax` tracks and the gaps between them, so a sideways wheel or swipe moves the header and the rows together until the last column is in view. A table of `fr`, `auto` or `percent` columns still fits its box. Under right-to-left the overflowing columns are still out of reach, because scroll containers do not yet scroll toward their start side.
- fd3adc4: Media and status components follow the values they are given instead of freezing the first one.

  - `VideoPlayer` shows captions that arrive after it mounted. A track is usually fetched once the player is already on screen, and an empty list at mount used to mean no captions ever. `Captions` also follows a track that changes while a paused clip's position stands still.
  - `VideoPlayer` now passes `onState`, `poster`, `placeholderColor`, `volume`, `muted` and `rate` through to its `Video`, so an application can say why a clip will not play.
  - `ProgressBar` switches between sweeping and filling as its `value` comes and goes, rather than deciding once at build. A bar that started without a value kept sweeping after one arrived, and a bar whose value went away reported a NaN. It also follows a change to `min` or `max` alone.
  - `ProgressBar` and `Meter` fill from the right under a right-to-left reading.
  - `Spinner` follows a `size` or `color` that changes.
  - A `Video` whose controls have `hideAfterMs: 0` puts the bar away when the pointer leaves, as documented, instead of keeping it up for good.
  - The fullscreen copy of a `Video` starts at the inline clip's volume and mute, keeps its `clock` and `poster`, and a level changed in fullscreen is still there after leaving it.
  - `Image` has an `onState` prop, like `Video`'s, and `Avatar` uses it: a picture that fails to load falls back to the initials (or the glyph) instead of leaving an empty disc. A new `src` is tried again.
  - `Alert` draws no blank title line while a bound `title` is empty, and the line appears when the title does. The same holds for `message`.
  - `Chip` draws a `count` or `icon` that arrives after the chip was built; the accessible name already included the count, so a screen reader and the screen now agree.
  - `Skeleton`'s and `SkeletonText`'s `shimmer` are documented as read once.

- bdc4780: A `MenuBar` can be reached from anywhere in the application, not only by tabbing to it. F10 moves focus to the bar, on the title it was last left on, and F10 again, Escape on the closed bar or choosing a command puts focus back on the control that had it. Alt pressed and released with no other key between does the same, and Alt with a menu's mnemonic opens that menu from wherever focus is, as in a Windows application. The keys are heard after the focused control has had them, so a control that binds F10 or an Alt chord keeps it, and Shift+F10 is left to context menus. Two new props turn them off for an application with its own use for them: `f10Key` (default true) and `altKey` (default true, except on macOS, where Option types characters and no such convention exists).

  `menuBarStep` keeps the bar's focused title when Escape or Tab gives the keyboard back, and treats F10 as leaving the bar in one press, open or closed. Escape and Tab used to reset the bar to its first menu.

- 08f3995: `NavigationRail` is new: the column of destinations an application keeps down its side, with one of them active. Rows take an optional icon and a badge, groups of rows open and close, and `collapsed` narrows the rail to a column of icons whose labels show as tooltips and stay the rows' accessible names. It is controlled by default, so the router can own where the application is: compute `value` from `router.isActive` and call `router.go` from `onChange`, and Back, Forward and links elsewhere move the rail with no code of their own. It is one tab stop; the arrows move focus between rows without navigating, Enter or Space activates, Right and Left open, close and walk groups (mirrored when the rail reads right to left), Home and End reach the ends, a letter jumps to the next row starting with it, and disabled rows are skipped. A screen reader finds a `navigation` landmark holding a `tree`, with the active row marked `current` and each group `expanded` or `collapsed`. A rail taller than its box scrolls, and the active row is kept in view.
- ff9dd85: `NavigationRail` can open a destination somewhere new. A Cmd-click (Ctrl-click off a Mac), a middle click, or Cmd-Enter or Ctrl-Enter on a focused row is reported to the new `onOpenElsewhere(key)` instead of `onChange`, and the active value does not move. A destination can also carry `to`, a router url or a `RouteTarget` as `Link` takes one: a plain press then navigates there after `onChange`, and a modified one asks the shell to open it somewhere new (`ShellService.openRoute`). It is opt-in: a rail with neither answers a modified press as a plain one, as before.

  A `NavigationGroup` can be `disabled`: its heading and every row under it are announced as unavailable, drawn in the disabled ink, skipped by the arrows and type-ahead, and inert to the pointer, and the group no longer opens or closes from the rail.

  An icon can be drawn as lines. `icon` now takes a `NavigationIcon`: a path string, filled exactly as before, or `{ path, style: 'stroke', strokeWidth }` for an outline icon set, where `path` may be several paths laid over each other and `fillRule` is passed through for a filled one.

- 66690b6: A `NumberInput` with a minimum can be typed into. Every keystroke used to be clamped, so with `min: 10` the "1" of "15" became "10" under the caret and the "5" made it "105". The field now keeps what is typed, reports a number only once it is one the field could hold, and bounds the text when it is left or Enter is pressed. A field left blank or holding text that is not a number goes back to the value it had, where it used to report 0, a number nobody typed and often not in range.

  A `Slider` under `textDirection: 'rtl'` agrees with what it draws. The fill already grew from the right, but a press and the arrow keys still read left to right, so a press near the right edge set nearly the maximum and Right made the fill longer. A press now counts from where the track starts, Left is more and Right is less, Up and Down are unchanged, and the thumb sits centred on the end of the fill rather than six pixels short of it.

  A `RadioGroup` marked `invalid` or given an `error` rings its circles in the danger colour, as a `Checkbox` rings its box; it used to say so only in the message under it. Its `direction` is documented as read once, when the group renders. A row of options under `textDirection: 'rtl'` takes Left as the next option and Right as the previous one, so the arrows move toward the option they point at; they used to move away from it.

  `SegmentedControl` takes a `ref`, as every other control does, and hands it the track.

  `onSubmit` on a `TextArea`, or on a multiline `TextInput`, is called on Command-Enter or Control-Enter. It was on the props and never called, since Enter alone is a new line there.

  `bind(cell, 'checked')` spreads into JSX beside other props. The handler's name defaulted to `onChange` only in principle: it was inferred from the props around the spread, so `<Switch label="Sync" {...bind(on, 'checked')} />` failed to compile with "'label' is specified more than once" and needed `'onChange'` spelled out.

- bdc4780: Overlays follow the reading direction. An overlay entry's `placement`
  now names `start` and `end` as reading edges: along the top or the
  bottom, `-start` lines the entry up with the anchor's start edge, which
  is its right under `textDirection="rtl"`, and the new sides `start`,
  `end`, `start-start`, `start-end`, `end-start` and `end-end` open beside
  the anchor toward those edges. `left` and `right` stay physical. An
  unanchored entry takes `start` and `end` edge offsets beside `left` and
  `right`. The direction is read from the entry's `environment`, or its
  anchor, the same node its theme comes from, and followed while the
  entry is open.

  So under right-to-left text a `Toast` at `bottom-start` is pinned to the
  bottom right corner and `bottom-end` to the bottom left; a `Menu` lines
  up with its button's right edge, opens a context menu leftward from the
  pointer, opens submenus to the left of their items (flipping right at
  the window edge), and swaps Left and Right for opening and closing them;
  `Combobox`, `DatePicker`, `Select` and `MenuBar` line their lists up
  with the trigger's right edge; and `Tooltip` takes `start` and `end`
  sides. Code that passed `bottom-start` to mean the left edge in a
  right-to-left tree now gets the right edge.

- fb803f1: A `Dialog` closed by its owner while a menu or another dialog is open over it no longer takes the keyboard from that one. It used to release whichever focus trap was innermost, so a dialog closed by a timer or a finished save under an open `Menu` ended the menu's trap instead of its own, and focus left the window still on top. It now releases only its own, as `Menu` already did.

  `Tooltip` and the `tooltip()` modifier close on Escape, wherever focus is and whether the pointer or the keyboard opened them, and stay closed until the pointer or focus arrives again (WCAG 1.4.13). With no tooltip open, Escape goes on to the page as before.

  A `Toast` waits while the pointer is on it or focus is in it, and starts its time again from the whole `duration` when they leave. Tabbing to Undo as the four seconds ran out used to close the toast under the focus, and focus went with it. Writing `open` true again while a toast is up is not a change and does not restart the timer, which is now said in its docs, as is that `bottom-start` is the left corner in right-to-left text too.

  `MenuBar` marks the title the arrows are on with the focus ring's colour while the bar has keyboard focus, so Left and Right visibly move along a closed bar. A command chosen with the pointer is followed by `onDismiss`, as one chosen with the keys always was and as the docs say.

  A `Menu` whose items are all disabled opens with no row highlighted, rather than the first painted as if Enter would choose it.

- 08f3995: A new `Popover`: a panel anchored to the control that opened it, for a filter panel, a short form beside the thing it edits, or a note too long for a tooltip. It is a non-modal dialog. Opening it moves focus in, to an `initialFocus` node or the panel itself; Escape closes it and puts focus back on the trigger; Tab walks the panel and, past either end, leaves it beside the trigger and closes it. There is no backdrop and no focus trap, so a press anywhere outside closes it and still lands on whatever was pressed, while a press in a `Select` or a second popover opened from inside it counts as inside.

  It is controlled with `open` and `onOpenChange`, where every close is a request the application may refuse, or self-managing with `defaultOpen`. It hears its anchor's presses itself, from the pointer, the keyboard or an assistive technology, so the trigger needs no `onClick` for it. `side` is `bottom`, `top`, `start` or `end` with an `align`, flipping and shifting to stay on screen, and `start` and `end` mirror under right-to-left. The panel announces itself as a `dialog` named by `label`, and `panelRef` hands over its node for the trigger's `controls`.

- ff9dd85: `Popover` now leaves Tab to a control inside it that takes the key for itself. The panel walks its own controls on Tab, and it used to do that even when the focused control had already cancelled the key, so a field of your own that indents on Tab lost focus instead. It now acts only on a Tab nothing inside it used. A `TextArea` is not such a control: Tab leaves a `TextArea` everywhere in the library, and inside a popover it still moves on to the panel's next control.

  A popover also closes when focus leaves it by a route other than Tab or a press: focus moved by code, by a shortcut that focuses another control, or by an assistive technology. Before, it stayed open with focus outside it. As with every other way of closing, this is a request through `onOpenChange(false)` that a controlled owner can refuse, and focus stays where it went. Focus on the anchor, or in an overlay opened from inside the panel (a `Select`'s list, a nested popover), does not count as leaving, by the same rule a press outside is judged by. A press outside that also moves focus asks to close once, not twice.

- 08f3995: `RangeSlider` chooses a span from a range: a low and a high value, each with a thumb of its own. Each thumb is its own tab stop and its own `slider` to an assistive technology, named from the label ("Minimum price", "Maximum price") or by `thumbLabels`, and announces a minimum and maximum that stop at the other thumb. The keys are `Slider`'s, per thumb, mirrored right to left in the same way. A press on the track moves the nearer thumb and drags it; two thumbs sitting together are told apart by the direction of the drag. The thumbs never cross, and `minDistance` keeps a gap between them. It is controlled with `value` and `onChange`, or self-managing with `defaultValue`, and reports every pair already in order.
- bdc4780: Scrolling a `DataTable`, `LazyList` or `Tree` to a row that was never mounted lands the row in view even when the rows are taller or shorter than the estimate. The jump goes by the estimate for every row on the way, and when that was short of the real height the row it was for ended up below the bottom edge, and stayed there: nothing ran another frame to measure it. A `UiVirtualWindow` can now hold an item in view (`holdInView`) until it has been measured, the runtime runs the frame that measures it, and the window folds the correction into the scroll adjustment it already returns.
- bdc4780: Arrow keys move toward the arrow pressed in a right-to-left `MenuBar`, `DatePicker` and collapsed `NavigationRail`. A bar's titles and a calendar's week run from the right under `textDirection: 'rtl'`, but Left still meant the previous title or the day before, so the ring moved away from the arrow; Left is now the next title and the day after there. A collapsed `NavigationRail` opens its labels on its end side, toward what it serves, rather than always on the right.
- b6af70e: A `Select` with more options than the window has room for fits on screen. Its open list had no height to keep to, so fifty countries ran past the top and bottom of the window and End highlighted an option nobody could see. The list is now cut to the room the window has and scrolls, the way a `Menu` does, and keeps the highlighted option in view as the arrows, Home, End or a letter move it, opening scrolled to the chosen one. The chosen option is also ticked, in the column `Combobox` and `Menu` keep for theirs, so it still shows once the highlight has moved off it.

  A `Combobox` option whose label is longer than its list is cut short with an ellipsis inside the list, rather than running past its edge and pushing its tick out after it.

- bdc4780: `Select` type-ahead is a search now, as in WAI-ARIA's listbox. Characters typed within half a second of each other are one search, so `b` then `l` reaches Blueberry past Banana, and a space in the middle of one is part of it, so "new z" reaches New Zealand. Typing the same letter again walks the options starting with it, from the current one and wrapping. It used to be one character matched from the top every time, so the second of two options sharing a first letter could only be reached with the arrows. Disabled options are still skipped. Closed, a search still changes the value without opening the list; open, it moves the highlight and Enter takes it.
- ff9dd85: `Slider` and `RangeSlider` now share one implementation of their track: how a press turns into a value, how a value is snapped and held in range, which way the track reads right to left, and where a thumb sits on it. Nothing a user sees or an application calls changes, but a fix to either control's track now reaches both, where before each carried its own copy.
- 264aa3a: A `Slider` with `thumb` set draws its thumb centred on the end of the fill at the top of the range, as it already did everywhere else. At the maximum the thumb overhangs the track by half its width, and the row holding it shrank the spacer before it to make room, so the thumb sat about six pixels short of the end of the fill it marks.
- c97fa3d: A `Divider` is visible wherever it is put. A horizontal rule in a column that aligns its children to the start used to be zero wide and as tall as the column's spare height, and an upright rule in a row that centres its children, a `Toolbar`'s included, had no height at all. A rule now stretches across its parent and grows along it while staying one pixel thick, and a caller's own layout props win over those defaults.

  Tabs and breadcrumbs no longer run off the side of whatever holds them. A `Tabs` strip with more tabs than room wraps onto further lines, so the selected tab is always on screen, and a long `Breadcrumb` trail wraps between crumbs, never leaving a separator at the start of a line. A `Tabs` panel whose tab was removed from `tabs` stops being named after it; the value itself is left for its owner to move, as `Pagination` leaves a page it did not choose.

  `FindBar`'s field follows the find session, so closing a search and opening it again shows an empty field over "No results" instead of the old words. A bar that unmounts now clears the service's field only when that field is its own, so it no longer takes the caret away from another bar.

  `Card` follows its `padding` as it changes, instead of keeping the first value. `Link`'s documentation now says what disabled does: Tab skips a disabled link, as it does every disabled control.

- 9115330: `Tree` treats a disabled row as one the keyboard cannot stop on. The arrows, Home, End and the new Page Up and Page Down step over it, as they do over a disabled option in `Select` or `Menu`; a click does not choose it or open it; and Enter, Space or the menu key never activates one, even when the application's own `selectedKey` names it. Right on an open folder with nothing in it now keeps the choice where it is, where it used to move on to the row after the folder, and a tree nested tens of thousands of levels deep opens instead of overflowing the stack.

  `LazyList` no longer reports row 0 as chosen when Home is pressed in an empty list. `PlainView` names its region "View" when it is given no `label`; it was taking a name from whatever it drew first. A `PlainView` checkbox or select that changes into another kind of node no longer leaves a subscription behind for the life of the view.

- Updated dependencies [ff9dd85]
- Updated dependencies [bdc4780]
- Updated dependencies [baf8dec]
- Updated dependencies [cbac578]
- Updated dependencies [66690b6]
- Updated dependencies [bdc4780]
- Updated dependencies [bdc4780]
- Updated dependencies [ff9dd85]
- Updated dependencies [69e5d47]
- Updated dependencies [bdc4780]
- Updated dependencies [3daa932]
  - gesso-core@0.6.27
  - gesso-framework@0.6.27

## 0.6.26

### Patch Changes

- Updated dependencies [0dbea31]
  - gesso-core@0.6.26
  - gesso-framework@0.6.26

## 0.6.25

### Patch Changes

- 9a576f1: `Tree` takes a `decoration`: for each row, an Observable of its label's colour, a short badge drawn at the row's end in the same colour, and a description said after the label to a screen reader. A file tree can now colour a changed file's name and put `M` or a count of errors after it, as VS Code's explorer does. The chosen row still draws in the selection colour.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-core@0.6.25
  - gesso-framework@0.6.25

## 0.6.24

### Patch Changes

- Updated dependencies [d9c0e6d]
  - gesso-framework@0.6.24
  - gesso-core@0.6.24

## 0.6.23

### Patch Changes

- fd6cc5c: Moving the selection or the pointer in a lazy list, data table, tree or combobox now updates the two rows it moved between, not every row on screen.
- c88eb25: A number input typed past its bound shows the bound, whether the app or the input owns the value. A controlled input used to keep showing what was typed ("39" for a maximum of 3).
- 87003bd: Video controls stop following a transport when it is replaced and when they unmount. They used to keep listening, piling up listeners and restarting the seek bar's readout for a clip nobody was showing.
- Updated dependencies [9ce5d36]
- Updated dependencies [3b6ecc0]
- Updated dependencies [ae5a84e]
- Updated dependencies [504fe2c]
- Updated dependencies [62e3bd4]
- Updated dependencies [4b92a02]
- Updated dependencies [2aecc54]
- Updated dependencies [72f7b90]
  - gesso-framework@0.6.23
  - gesso-core@0.6.23

## 0.6.22

### Patch Changes

- Updated dependencies [02f186e]
  - gesso-core@0.6.22
  - gesso-framework@0.6.22

## 0.6.21

### Patch Changes

- 2f1b7d7: `Combobox` shows a value the application changes while it has focus but nobody is typing in it. Focus alone held the old label, so a picker whose value was changed from elsewhere, just after a choice in it, said the old choice until it lost focus. A search under way is still left alone.
- bcb42b3: A combobox's label changed by the application while it has focus is selected whole, as a chosen label is on the way in, rather than left under part of the old one's selection.
- 0796ea7: `LazyList` takes `hover`: its rows light up under the pointer (`controlBackgroundHovered`), as a log's or a file tree's do, while the chosen row keeps the selection's colour.
- 8cf9bd5: `MenuItem` takes `separator`, `shortcut` and `danger`. A separator draws a rule above its item, starting a group (the arrows walk past it, as they do past nothing); a shortcut is said at the row's end, muted, and in the item's accessible name; a danger item's label is in the danger colour, for one that cannot be undone.
- 43be6dd: A menu's highlight follows the pointer: the item it rests on is the one Enter chooses, and an item left for another is no longer lit beside it.
- 4e98848: A menu opens its submenus when its items arrive after it was told to open, as they do when both come from one change with `open` bound first. The submenu was only made if the items had one at the moment the menu opened.
- c99b972: `MenuItem` takes `items`, a submenu: it opens beside its item on a press, the pointer resting on it, Enter or Right, Left or Escape goes back, and a choice in it is the menu's own, closing both. `Menu` takes `compact`, for shorter rows in a long context menu, as `Select`'s.

  `FocusService.releaseTrap` (and `UiFocusManager.popScope`) take the node trapped in, and end only that trap: none, when it ended already. A trap ends by itself when its subtree is removed, and a menu that released its trap after closing ended the trap under it as well, a submenu's menu's, leaving the keyboard nowhere.

- 856bc51: `TextInput` takes `secret`, and `EditableText` a `secret` property, for a password or a passphrase. The field draws a bullet for every character, copy and cut take nothing from it, and while it has focus the shell edits it through a hidden `<input type="password">`, so the browser and the platform treat it as a password: secure input on macOS, no autocorrect, and a screen reader that calls it a secure text field. The value still reaches `onChange`; the shell's element, the semantics record and the accessibility mirror only ever hold the bullets. A secret field is one line.
- 03fee9c: `Tree` takes `onContextMenu`: a right click on a row chooses it and asks for its menu, with where the pointer was; the menu key or Shift+F10 asks for the chosen row's, with no point. A file tree's New File, Copy Path and the rest have somewhere to be.
- Updated dependencies [499d7ae]
- Updated dependencies [42c06c1]
- Updated dependencies [c99b972]
- Updated dependencies [e612a33]
- Updated dependencies [856bc51]
- Updated dependencies [47d9cc1]
- Updated dependencies [211e791]
  - gesso-core@0.6.21
  - gesso-framework@0.6.21

## 0.6.20

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - gesso-framework@0.6.20
  - gesso-core@0.6.20

## 0.6.19

### Patch Changes

- Updated dependencies [c047559]
- Updated dependencies
  - gesso-core@0.6.19
  - gesso-framework@0.6.19

## 0.6.18

### Patch Changes

- 927a601: `Tooltip`, `Button`, `Link`, `Alert`, `Card`, `Toolbar` and a tab panel follow their children. A component runs once, but its parent can draw it again in place, as a `LazyList` does with a row whose data changed, and its new children then arrive on the same component; each of these read its children once, at mount, and kept showing the first. A count wrapped in a `Tooltip` in a list's row said 0 over eighteen while the row's own text beside it was right.
- d4579d4: `LazyList` lays each row across the list's whole width, as a row of any column is. Its rows were placed at their content's width, so a row with something at its end (a count, a time, a close button after a name that takes `flex: 1`) had it beside the name instead of at the right edge.
- f6b730d: `Tree` and `LazyList` take `flush`: drawn as part of the surface they sit in, with no border, no background of their own and square corners. A sidebar's file tree is the case, where a framed box inside the panel reads as a form field. The focus ring is kept.
- d794279: `NumberInput` takes `labelHidden`, as `TextInput` and `Select` do: the label still names the field for a screen reader, and is not drawn above it, for a field whose heading already says what it is.
- 2c2872e: A `NumberInput`'s − and + are centred in their buttons, which are as tall as the field and light up under the pointer. The glyph was the button's `text`, drawn from its top corner, so it sat at the top left of a button a few pixels shorter than the field beside it.
- 895f431: `PlainView` draws a screen described as plain data, for code that cannot run in the render worker: a plugin in a worker of its own, a server, another process. It sends a tree of `PlainNode`s (columns and rows, scrolling, text, headings, buttons, text fields, checkboxes, selects, lists and dividers), which cross a thread as any channel's data does, and hears back what the person did as `PlainAction`s. Sending the tree again changes it: nodes are matched by `key`, and one that stays keeps its controls, focus and scroll, with only its changed fields written. What arrives is checked by `plainNodeOf` (also exported) and held to limits on nodes, depth and string length; anything the view cannot draw is left out and reported through `onProblem` rather than thrown.
- cff73b4: `SplitPane` takes `divider: 'line'`: a one-pixel rule in the middle of the same six-pixel grab area, for panes that meet edge to edge, as an editor's sidebar and panel do. The framed bar, still the default, read there as two lines with a gap between.
- 2e0fcb6: `Tree` has branches whose children come later. A `TreeNode` with `branch: true` is a branch with no children yet (an empty folder, or one read when it opens): it has an arrow, says whether it is open, and opens empty until `nodes` brings its children. A double click on a row calls `onActivate`, as Enter does, which is a file explorer's open-for-good.
- `Tree` takes `revealKey`: the row with that key is scrolled into view as soon as it is one of the rows, waiting for its folders to open and their children to arrive. A fresh object asks again, so a row scrolled away is brought back. Writing `selectedKey` from outside still does not scroll, so a file tree whose selection follows an editor does not jump unless it is asked to; a "select opened file" button, or a reveal on every tab change, is a `revealKey`.
- Updated dependencies [3ca92f7]
- Updated dependencies [7da31d2]
- Updated dependencies [32f00f4]
- Updated dependencies [cd5b2c2]
- Updated dependencies [70d3f9e]
- Updated dependencies [4a73051]
- Updated dependencies [95a6503]
- Updated dependencies [1b6e6a7]
- Updated dependencies [de60c5e]
- Updated dependencies [72a8dc3]
- Updated dependencies [c7dd7d2]
  - gesso-core@0.6.18
  - gesso-framework@0.6.18

## 0.6.17

### Patch Changes

- 762a2b8: `Menu` and `MenuBar` panels scroll when they are longer than the room they are given. A menu bar's thirty-item Format menu in a short window used to run off the bottom, with nothing past the edge reachable; it now stops at the window's edge and its rows scroll inside the frame with the wheel, while the arrow keys, Home and End keep the highlighted row in view. Hovering a row does not scroll the list.
- Updated dependencies [fcf0d04]
  - gesso-core@0.6.17
  - gesso-framework@0.6.17

## 0.6.16

### Patch Changes

- Updated dependencies [d67e80b]
- Updated dependencies [dd5c789]
- Updated dependencies [b681046]
- Updated dependencies [1f60081]
- Updated dependencies [8149ae2]
- Updated dependencies [4eed2fd]
- Updated dependencies [548a3b0]
  - gesso-framework@0.6.16
  - gesso-core@0.6.16

## 0.6.15

### Patch Changes

- Updated dependencies [dd812b3]
- Updated dependencies [9872957]
  - gesso-framework@0.6.15
  - gesso-core@0.6.15

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
