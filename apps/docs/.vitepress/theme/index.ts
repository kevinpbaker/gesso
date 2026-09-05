import DefaultTheme from 'vitepress/theme';
import { defineClientComponent } from 'vitepress';
import type { Theme } from 'vitepress';
import type { Component } from 'vue';
import HomePage from './HomePage.vue';
import './brand.css';

/**
 * `LiveExample` is registered as a *client* component deliberately.
 *
 * VitePress prerenders every page to HTML at build time, in Node, where
 * there is no `Worker`, no `document` and no `OffscreenCanvas`.
 * `defineClientComponent` defers the import so the module, and the
 * Gesso packages it pulls in, is never loaded during that render.
 *
 * `home` is not a name chosen for readability. `VPContent` picks the
 * layout for a page by asking whether a component is registered under
 * the name in its front matter, and renders `<component :is="home" />`
 * in place of its own home layout when one is. Registering `HomePage`
 * under that name is therefore the whole of the custom landing page:
 * `index.md` says `layout: home` and gets this instead. It is a
 * server-rendered component, unlike the two above, because the words
 * on the landing page are the ones that have to be in the HTML a
 * crawler is served.
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // `vue-shim.d.ts` types every `.vue` import as `unknown`, on
    // purpose, so the one place that needs a component says so.
    app.component('home', HomePage as Component);
    app.component(
      'LiveExample',
      defineClientComponent(() => import('./LiveExample.vue'))
    );
    app.component(
      'ThreadDemo',
      defineClientComponent(() => import('./ThreadDemo.vue'))
    );
  }
} satisfies Theme;
