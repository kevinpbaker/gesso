# gesso-vite-plugin

Finds a Gesso application's worker entries, writes the constructions and the hot-replacement wiring, and says when a save will reload the page.

```bash
npm install --save-dev gesso-vite-plugin
```

```ts
// vite.config.ts
import { gesso } from 'gesso-vite-plugin';

export default defineConfig({
  plugins: [gesso()]
});
```

Then the worker boilerplate goes away:

```ts
// main.ts
createApp({ history: { mode: 'path' } }).mount('#app');

// RenderWorker.ts
renderRoot(AppRoot).useService(Feed);
```

## It is optional, deliberately

Nothing in `gesso-core` or `gesso-framework` mentions Vite, and no bundler is imported into the framework. Everything this plugin writes, you can write by hand: the literal `new Worker(new URL(...))` construction stays the documented fallback, and the plugin's factories go in first so your own options spread over them.

## The diagnostic that is worth the install

One failure looks exactly like a bug in the framework: a save that reloads the whole page instead of replacing a module. The cause is a module reached from the main thread as well as from the render worker, which Vite cannot hot-replace because it propagates the invalidation to a main-thread importer that does not accept it. The plugin says so, and names the module, instead of leaving you to guess.

## Channels an agent can read

A channel contract is types and comments, and both are gone at run time. The plugin reads each contract with TypeScript 7's checker and attaches a JSON Schema of the view and every command to the token, with descriptions taken from your JSDoc, so `channelSchema(token)` can tell an AI agent what the application holds and what it can be asked to do. `channelSchemas: false` turns it off.

## Documentation

[The Vite plugin](https://gesso-docs.vercel.app/tooling/vite-plugin)

MIT (c) Kevin Baker
