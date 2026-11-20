---
'gesso-core': minor
'gesso-framework': patch
---

The WebGPU renderer and the default video decoder are loaded when they are first needed instead of with every render worker. Canvas2D is the default renderer, and an app with no `Video` never decodes one, but both were in every worker's bundle: the playground's sign-in worker goes from 205 kB to 184 kB gzipped. They are new entries, `gesso-core/webgpu` and `gesso-core/video`, which the runtime imports with `import()`. The root `gesso-core` entry still exports the same names. Nothing changes for an app: a runtime drawing with WebGPU reports `pending` until the module and the device are both ready, as it already did while it waited for the device.
