---
'gesso-framework': minor
'gesso-components': patch
---

A `Dialog` that can't be dismissed now keeps the page from presses, as one that can does: every dialog has a backdrop over the whole page, positioned panels with a `zIndex` included, and `dismissible` decides only whether a press or a wheel on it closes the dialog. Before, a dialog with `dismissible={false}` had no backdrop, so a press beside it reached a button in the page under the modal. Overlay entries take a new `modal` option for the same backdrop.
