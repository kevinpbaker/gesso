---
'gesso-core': patch
---

A frame's layout agrees with a fresh one when content arrives under a flex item whose basis is its content. The item's basis was read from a child whose `height: 100%` had nothing to resolve against yet, and the same child, resolved on the next measure, was then treated as a relayout boundary, so rows arriving in a list never reached the basis. The column kept sharing its height as it had while the list was empty, until something unrelated (a theme change, a resize) laid it out from the top, and an application's header then shrank under the reader. A scroll view with no size of its own passes the same on to its content, since under a loose bound its size is its content's.
