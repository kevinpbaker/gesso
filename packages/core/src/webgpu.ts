/**
 * `gesso-core/webgpu`: the WebGPU renderer, as an entry of its own.
 *
 * The runtime imports this with `import()`, only once it has decided
 * to draw with WebGPU. Canvas2D is the default, and in the root barrel
 * the renderer, its shaders and its glyph atlas came to about 30 kB
 * gzipped that every render worker loaded and most never ran. The root
 * barrel still exports the same names, for code that wants them
 * eagerly.
 */
export { WebGPURenderer } from './rendering/webgpu/WebGPURenderer';
export { createWebGPUSurface } from './rendering/webgpu/WebGPUSurface';
