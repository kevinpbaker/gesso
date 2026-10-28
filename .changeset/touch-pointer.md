---
'gesso-core': minor
'gesso-framework': minor
'gesso-components': minor
---

Touch, apart from the screen's size. What the person points with is now in the environment (`UiEnvironmentKeys.pointer`, `fine` or `coarse`): the runtime reads it from the device (CSS's `pointer` feature), keeps it on `ShellService.pointer`, and provides it at the root, and a `pointer` prop says it for a subtree, as a design tool's phone frame does. A theme provided under a coarse pointer is turned for it (`withPointer`): its `touch` values (larger type, more room, token groups of its own) are laid over it, and a token group it does not carry resolves to the group's own `coarse` values (`defineThemeExtension({ coarse })`). The controls use that: on touch a medium `Button` and a `TextInput` are at least 44 high (`TOUCH_TARGET`), a small button 36 and a large one 52. With a mouse nothing moves.
