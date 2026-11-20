---
'gesso-components': patch
---

Canvas editing kit: `groupHandles: false` keeps several chosen shapes from sharing eight handles, for an application that resizes one shape at a time; the dashed box round several chosen shapes is drawn either way. `colors` takes the readout's plate, ink and font (`readout`, `readoutText`, `readoutFont`), and so does `paintReadout`, so an application's own palette and type carry over.
