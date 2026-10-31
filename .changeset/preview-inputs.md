---
'gesso-framework': patch
---

`InspectionService.previewInputs(anchorId, inputs)` draws a component as though its parent passed those inputs, until `endInputPreview(anchorId)` gives it back the ones it was written with. The component is the same live instance, named by an anchor from `inspect(node).owners`. This is for a design tool that jumps a component on a played screen to one of its states. Each input the preview starts or ends is handed its value again, so a control that owns its value starts again from it.
