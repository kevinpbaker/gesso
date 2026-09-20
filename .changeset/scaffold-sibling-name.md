---
'create-gesso-app': patch
---

**A scaffolded sibling keeps its whole name.** `create-gesso-app
../gessosheet`, run from inside a checkout called `gesso`, finished by
announcing `Created gessosheet in heet.`

The closing message worked out where the project had landed by testing
whether the target path started with the current directory and slicing
that many characters off the front. That is a string test standing in
for a path one, and `/work/gessosheet` starts with `/work/gesso`
without ever having been inside it, so the name lost its first four
characters and the `cd` line underneath told the reader to go
somewhere that does not exist.

It is `relative` now, which answers the question that was being asked.
Which of the two paths to print is then readability rather than
correctness: a child or a sibling is shorter said relatively, and is
what the caller typed, while a target on the far side of the tree is a
run of `..` segments the absolute path beats. The files were always
written to the right place; only the message was wrong.
