---
'gesso-core': patch
---

Text without runs is broken into lines one hard line at a time and remembered per line. A keystroke in a long multiline field re-wraps only the line it changed instead of the whole text: typing into a 5,000-line field went from about 19 ms of layout to about 3.5 ms. Text with `spans` keeps the previous path, because its widths are measured by offsets into the whole text.
