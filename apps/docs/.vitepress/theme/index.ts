import DefaultTheme from 'vitepress/theme';
import { defineClientComponent } from 'vitepress';
import type { Theme } from 'vitepress';

/**
 * `LiveExample` is registered as a *client* component deliberately.
 *
 * VitePress prerenders every page to HTML at build time, in Node, where
 * there is no `Worker`, no `document` and no `OffscreenCanvas`.
 * `defineClientComponent` defers the import so the module — and the
 * Gesso packages it pulls in — is never loaded during that render.
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component(
      'LiveExample',
      defineClientComponent(() => import('./LiveExample.vue'))
    );
  }
} satisfies Theme;
