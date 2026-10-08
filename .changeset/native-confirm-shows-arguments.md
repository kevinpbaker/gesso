---
'gesso-electrobun': patch
---

`messageBoxConfirm` now shows a person everything they are being asked to approve, and declines on Enter on macOS. The command's description and the arguments the agent sent were in the dialog's `detail`, which macOS does not show, so a Mac asked only "An AI agent wants to createBranch in workspace" with nothing to say which branch; they are now part of the message, which every platform shows. And the buttons were Allow then Decline: macOS makes the first button the default whatever `defaultId` says, so Enter allowed the command. Decline is now first, and the default on every platform.
