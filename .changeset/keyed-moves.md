---
'gesso-core': patch
---

Reconciling keyed children moves only the ones that are out of order. Children were placed by moving each in front of a cursor, so moving one child to the back moved every child after it instead; a `LazySheet` with `recycleRows` does that on every row of a scroll down, which made scrolling down cost more than scrolling up. The longest run of children already in order now stays where it is.
