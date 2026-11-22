import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The React half of the agent eval: see `scripts/eval-agents.ts`. It
 * imports the Gesso tracker's model, so both start from the same issues,
 * which sits outside this folder.
 */
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['../../..'] } }
});
