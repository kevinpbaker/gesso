/**
 * What a `.vue` import is worth to the TypeScript compiler.
 *
 * `tsc` does not parse single file components, so `theme/index.ts` has
 * no way to know what `import('./LiveExample.vue')` resolves to. The
 * declaration below is the honest answer: something exists at that
 * specifier, and its shape is unknown here. Writing `DefineComponent`
 * instead would look more informative and would not be, since the props
 * and emits behind it are never read from the file either.
 *
 * The consequence is worth stating plainly, because it is a hole in
 * this repository's type coverage rather than a detail: nothing checks
 * the contents of `LiveExample.vue` or `ThreadDemo.vue`. A call inside
 * one of them can pass the wrong arguments to a Gesso API and no gate
 * in the repository will notice. The tool that would notice is
 * `vue-tsc`, and it cannot run here: it loads `typescript/lib/tsc` to
 * patch it, and this workspace is on TypeScript 7, whose `typescript`
 * package is a launcher for the native compiler and exports no such
 * module. Covering the components means pinning a second TypeScript
 * major for the docs app alone.
 */
declare module '*.vue' {
  const component: unknown;
  export default component;
}
