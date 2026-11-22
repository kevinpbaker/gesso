---
'gesso-framework': patch
'gesso-components': patch
---

DOM islands: a box in the layout that a real DOM element covers, for what a canvas cannot be. A password manager, the browser's autofill and a phone's one-time-code suggestion fill only a real `<input>`, and a map, a payment field or an embedded editor comes as DOM.

`NativeInput` in `gesso-components` is a text field whose text is a native `<input>`. The canvas draws its label, frame, focus ring and message. Fields with the same `form` are one `<form method="post">` on the page, so Chrome sees a username field and a password field as one sign-in form. Enter submits the form with `requestSubmit()`, which a password manager watches for. A sign-in button drawn on the canvas calls `IslandService.submitForm`. The shell registers the field with `createApp({ islands: [nativeInputIsland] })`. Only the field you type in shows its DOM text, and the canvas draws every other field in the same font.

For an island of your own, declare a token with `island<Props, Event>(kind)` in the contract module. Register a factory on the shell with `provideIsland(token, factory)`, or with a function that imports the factory when the first island of that kind mounts. Put it in the tree with `<Island of={token} props={…} onEvent={…} />`. `elementIsland(create)` makes the element once. `islandController()` posts messages to the element. The `standIn` rule hides the element while its box moves and draws the island's children in its place.

On every frame the shell places each element over its box, snapped to device pixels. Scroll containers clip the element. Overlay entries and sticky nodes cut it away where they cover it, so a menu opened over a field shows and takes the press. A menu's transparent backdrop makes the element ignore the pointer without hiding it. An island is a tab stop. Tab, Shift+Tab and an unused Escape in the element go back to the app's focus order. A wheel over the element scrolls the canvas unless the element keeps it. The semantics mirror points at the element with `aria-owns`. The island host loads as a separate chunk, only for an app that registers islands. The element is one frame behind its box while the box moves. The islands guide has the measurements.
