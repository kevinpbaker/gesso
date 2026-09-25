import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'gesso-framework': at('../packages/framework/src/index.ts'),
      'gesso-core': at('../packages/core/src/index.ts')
    }
  },
  build: {
    lib: { entry: at('./shell.ts'), formats: ['es'], fileName: 'out' },
    outDir: at('./out'),
    minify: true,
    emptyOutDir: true
  }
});
