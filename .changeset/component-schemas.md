---
'gesso-vite-plugin': patch
'gesso-components': patch
---

`ContractReader.readComponents(file)` describes every component a module exports, as the channel reader already describes channels: what each one is for, from its JSDoc, and each input as JSON Schema with its TypeScript type, its description, its `@default`, and whether it is required. A callback, a child and a value only code can make are named for what they are rather than rejected. A type several inputs share, such as `UiLength`, is described once under `$defs`, and an input inherited from a shared props type says which one. Point it at a library's index and it reads the whole library: all 55 of `gesso-components` in under half a second. It is the catalog an AI agent designing with the library reads, so that it reaches for `Badge` instead of drawing one from boxes.

Every component in `gesso-components` now opens with a one-line JSDoc summary, so hovering one in an editor says what it is. Twelve had their description only in the design note at the top of the file, which attached to whatever was declared under it.
