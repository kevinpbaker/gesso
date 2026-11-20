---
'gesso-framework': patch
---

A font family's faces now relay the page out once between them, not once per face. Every notice from `FontService` drops every measured width and lays the whole tree out again, about 17 ms for a 5,000-node page, and a family of four weights that arrived a frame or two apart paid that four times at start-up. The listener now hears a family once all of its faces have settled, or 100 ms after the first of them did, so one slow face cannot keep the rest of the text in the fallback.
