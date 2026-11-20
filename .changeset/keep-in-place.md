---
'gesso-core': minor
'gesso-framework': minor
---

`ScrollService.keepInPlace(node, { at, for })` holds a node, or a point in it, where it is on screen through the layout change you are about to make. After the next layout the scroll containers above it scroll by however far the layout moved it, on both axes, innermost first, as far as they can. The runtime already did this for the focused node, vertically; this is the same for any node and any change. In Calcwright, a click that opens a drawing folds the palette and opens the inspector, and the shape under the pointer moved 340 px away; held, it stays under the pointer. `for` keeps holding through a change animated over several frames, and the call returns a function that lets go early. `LayoutEngine.screenPoint` and `holdAdjustments` are what it is built on.
