import { gesso } from 'gesso-vite-plugin';
import { defineConfig } from 'vite';

/** The Gesso half of the agent eval: see `scripts/eval-agents.ts`. */
export default defineConfig({
  plugins: [gesso({ overlay: false, agentName: 'tracker' })]
});
