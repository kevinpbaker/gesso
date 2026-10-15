---
'gesso-core': patch
---

Layout asks the text measurer far less often. A text node remembers the paragraph it was last measured as, and a paragraph that fits at its width is reused at any wider width, by the node and by the measurer, instead of being laid out again. A full layout pass over a 5,000-node list is about 20% faster and a step of a window resize over 500 paragraphs about 26% faster. `TextMeasurer` gains an optional `generation`, which `ParagraphTextMeasurer` counts up on every `invalidate()`.
