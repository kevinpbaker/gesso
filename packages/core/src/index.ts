/**
 * `@gesso/core` — the retained UI graph, the layout engine, the two
 * renderers, input, and everything else that does not know what a
 * component is.
 *
 * This barrel is the package's whole public surface: cross-package
 * imports go through it rather than through a deep path, which is what
 * makes `api/core.api.d.ts` a review of the surface rather than a
 * review of one file. Each area keeps its own barrel, and this file is
 * a barrel of barrels — so what an area exports is decided in the area,
 * next to the code, and the rolled-up `.d.ts` is where the total is
 * read.
 *
 * Test doubles are deliberately not here; they are `@gesso/core/testing`.
 */
export * from './animation';
export * from './bindings';
export * from './composition';
export * from './editing';
export * from './environment';
export * from './find';
export * from './graph';
export * from './input';
export * from './layout';
export * from './modifiers';
export * from './properties';
export * from './rendering';
export * from './scheduler';
export * from './selection';
export * from './semantics';
