---
'gesso-framework': patch
---

A tool call whose value fits none of a tagged union's shapes now says what is wrong with the shape it was meant as, picked by its `kind` (or other tag): "input.shape.d is required." instead of "does not match any of the 14 shapes". A missing or unknown tag lists the words it may be. Repairs (a number sent as text) reach inside the meant shape too.
