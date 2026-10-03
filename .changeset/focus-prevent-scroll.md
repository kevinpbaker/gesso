---
'gesso-core': minor
'gesso-framework': minor
---

Focus from code can leave the page where it is, as `element.focus({ preventScroll: true })` does: `autoFocus({ preventScroll: true })`, `FocusService.focus(node, { preventScroll: true })` and `UiFocusManager.focus(node, source, { preventScroll: true })`. For focus placed for a screen reader, such as a page's content region focused as it opens, which a reveal scrolled to a few pixels short of its own top. The options reach `onFocusChange` listeners as a third argument, and a key pressed later that makes the focus visible doesn't scroll to it either. The default is unchanged.
