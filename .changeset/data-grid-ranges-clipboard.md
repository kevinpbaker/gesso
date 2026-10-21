---
'gesso-components': patch
---

`DataGrid` selects ranges, copies and pastes, and jumps faster.

A range of cells grows from the active cell with Shift and the arrows, Home, End, Page Up and Page Down (with Ctrl or Cmd for the corners), with a drag across cells, or with a Shift+click; Ctrl+A or Cmd+A selects every cell and Escape collapses the range back onto the active cell. The range is drawn with the theme's selection fill and a border round it, and every cell in it is announced as `selected`. It can be left to the grid, started with `defaultSelection`, or owned by the application through `selection` and `onSelectionChange`, with a `DataGridRange` of two corner cells. Whatever moves the active cell collapses the range onto it, and typing or Enter still edits the active cell.

Ctrl+C or Cmd+C copies the range as tab-separated text, a line per row, through `ShellService.copyText`, taking the stored values rather than the formatted ones and quoting any value with a tab, a line break or a quote in it. A paste writes a block from the active cell across and down through `onCellChange`, stops at the grid's edges, keeps every read-only cell's value, and selects what landed. Ctrl+X copies and then clears the range's editable cells, and Delete and Backspace now clear every editable cell in the range rather than the active cell alone.

After a commit, a clear or a paste the grid now reads back only the cell that changed, where it used to read every cell in view. An application whose other cells follow from an edited one (a total) should move `revision` on in `onCellChange`, as the docs example now does.

Keys typed between the one that opens the editor and the editor taking the keyboard are kept, in order: typing a word quickly over a cell no longer loses its second letter, and an Enter typed in the same moment commits it.

The grid recycles its rows, so a jump that replaces every row in view (a scrollbar drag down a long sheet, Ctrl+End, an active cell sent far away) reuses the cell nodes instead of building new ones: about 11 ms a frame for a 1200 by 800 grid in the test runtime, down from about 30.
