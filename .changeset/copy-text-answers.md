---
'gesso-framework': minor
---

`ShellService.copyText` now returns a promise of whether the text reached the clipboard, so an application that says "Copied" after a command or a shortcut can say so only when it's true. Callers that ignore it are unaffected. The `clipboard` request carries an `id`, the shell answers it with a `clipboardResult` message, `GessoRuntime.settleClipboard` settles it, and `writeClipboard` resolves `false` when both the async clipboard and the `execCommand` fallback refuse. A runtime with no shell answers `false` at once.
