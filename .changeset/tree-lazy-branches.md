---
'gesso-components': patch
---

`Tree` has branches whose children come later. A `TreeNode` with `branch: true` is a branch with no children yet (an empty folder, or one read when it opens): it has an arrow, says whether it is open, and opens empty until `nodes` brings its children. A double click on a row calls `onActivate`, as Enter does, which is a file explorer's open-for-good.
