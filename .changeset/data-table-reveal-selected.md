---
'gesso-components': patch
---

`DataTable` takes `revealSelected`, as `LazyList` does. With it, a row the application chooses by writing `selectedRow` (a record opened from a search, a link to one line of a long log) is scrolled into view clear of the sticky header, including a row far from the window that has never been mounted. A row chosen before the table has been laid out is revealed once it has a height. The table follows the row rather than its position, so a sort that carries the chosen row elsewhere does not scroll after it. Without the prop a written row is drawn as chosen and nothing more, as before, and rows reached from the keyboard scroll into view either way.
