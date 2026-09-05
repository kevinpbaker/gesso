<script setup lang="ts">
 /**
 * The landing page.
 *
 * VitePress renders this instead of its own home layout: `VPContent`
 * falls through to `<component :is="frontmatter.layout" />` when a
 * component is registered under that name, so `layout: home` in
 * `index.md` plus the `home` registration in `theme/index.ts` is the
 * whole mechanism. Registering it that way, rather than `layout: page`
 * with the sections written into markdown, is what turns the sidebar
 * and the outline off and lets a band run the full width of the
 * window.
 *
 * Two things on this page are the live framework rather than a picture
 * of it: the hero panel is a `DataTable` in a render worker, and the
 * proof band is the same component mounted twice, once on each thread.
 * The counter's source is the file the test suite asserts on, included
 * by `index.md` and slotted in below through `<Content />`, so the one
 * code sample on the site's front page cannot drift from the code.
 *
 * The prose here is the pitch and stops there. The conformance figures,
 * the framework comparison and the honest list of what has not been
 * proven live on `/guide/why-gesso`, which this page links to twice.
 */
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">
          <svg class="stroke-glyph" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
          </svg>
          The whole interface, off the main thread
        </p>
        <h1>Interfaces that don't stutter</h1>
        <p class="lede">
          Components, layout, paint, text and input all run in a render worker. Your application logic runs in another.
          Whatever you compute, the frame still lands.
        </p>
        <div class="actions">
          <a class="button button-primary" href="/guide/installation">
            Get started
            <svg class="arrow" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </a>
          <a class="button button-quiet" href="/guide/why-gesso">How it compares</a>
        </div>
      </div>

      <div class="hero-panel">
        <div class="panel">
          <div class="panel-head">
            <span class="panel-label">One canvas</span>
            <span class="panel-meta"><i class="dot" />render worker</span>
          </div>
          <LiveExample id="datatable" height="312" />
          <p class="panel-foot">Every pixel above is drawn by Gesso into a single canvas element.</p>
        </div>
      </div>
    </section>

    <section class="proof">
      <div class="band">
        <div class="band-head">
          <p class="eyebrow eyebrow-linen">Try it</p>
          <h2>Block the main thread for three seconds</h2>
          <p class="lede">Two copies of the same component. Only one of them notices.</p>
        </div>
        <ThreadDemo scheme="dark" />
      </div>
    </section>

    <section class="pillars">
      <div class="section-head">
        <p class="eyebrow">What you get</p>
        <h2>Not a canvas. An engine.</h2>
      </div>
      <div class="pillar-grid">
        <article class="card">
          <div class="figure figure-layout">
            <span class="fig-outline" />
            <span class="fig-stack">
              <span class="fig-solid" />
              <span class="fig-pair"><span /><span /></span>
            </span>
          </div>
          <h3>A real layout engine</h3>
          <p>
            Flex and grid with CSS's own semantics, typed lengths, and text that wraps, clamps and sits on a baseline.
            Every case is checked against Chrome, so a box is the size you expect.
          </p>
          <a class="card-link" href="/layout/flex">Layout in full</a>
        </article>

        <article class="card">
          <div class="figure figure-text">
            <span lang="ja">日本語の行の折り返し</span>
            <span lang="ar" dir="rtl">النص من اليمين</span>
            <span lang="hi">हिंदी की पंक्ति</span>
          </div>
          <h3>Text in every script</h3>
          <p>
            Lines break where Chrome breaks them in eight scripts, with colour emoji, right to left paragraphs and web
            fonts loaded inside the worker. Both renderers, same result.
          </p>
          <a class="card-link" href="/guide/text">How text works</a>
        </article>

        <article class="card">
          <div class="figure figure-parts">
            <span /><span /><span class="fill-brand" /><span /> <span /><span class="fill-linen" /><span /><span />
          </div>
          <h3>Twenty-seven components</h3>
          <p>
            Inputs, overlays, tables, trees and media. Every one themed, keyboard operable, and announced to assistive
            technology without you doing anything.
          </p>
          <a class="card-link" href="/components/">Browse the library</a>
        </article>
      </div>
    </section>

    <section class="model">
      <div class="section-head section-head-wide">
        <p class="eyebrow">The model</p>
        <h2>Nothing re-runs</h2>
        <p class="lede">
          A state change writes one property on one node. There is nothing to memoise, no dependency array to keep
          honest, no view identity to reason about. Your component function runs once, so every closure in it is stable.
        </p>
      </div>
      <div class="model-grid">
        <div class="code-panel vp-doc">
          <Content />
        </div>
        <div class="panel result-panel">
          <div class="panel-head">
            <span class="panel-label">What it draws</span>
          </div>
          <LiveExample id="counter" height="180" />
          <p class="panel-foot">
            Neither version names a colour. <code>primary</code> is a theme token, resolved when it is painted, which is
            why the counter follows this page's light and dark toggle.
          </p>
        </div>
      </div>
    </section>

    <section class="fit">
      <div class="fit-grid">
        <div>
          <h3>Reach for Gesso when</h3>
          <ul class="fit-list">
            <li>
              <svg class="stroke-glyph" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
              </svg>
              <span>The screen is an application, not a document.</span>
            </li>
            <li>
              <svg class="stroke-glyph" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
              </svg>
              <span>Heavy work has to run beside the interface without ever blocking it.</span>
            </li>
            <li>
              <svg class="stroke-glyph" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
              </svg>
              <span>A hundred thousand rows have to scroll at sixty frames.</span>
            </li>
            <li>
              <svg class="stroke-glyph" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
              </svg>
              <span>You want the interface tested without a browser at all.</span>
            </li>
          </ul>
        </div>
        <div class="fit-against">
          <h3>Reach for something else when</h3>
          <ul class="fit-list">
            <li>
              <span class="square-glyph" />
              <span>
                The value of the page is being indexed and linked. A canvas has nothing for a crawler to read.
              </span>
            </li>
            <li>
              <span class="square-glyph" />
              <span>You need autofill, password managers and mobile keyboards behaving natively.</span>
            </li>
            <li>
              <span class="square-glyph" />
              <span>You need the DOM ecosystem more than you need the thread.</span>
            </li>
            <li>
              <span class="square-glyph" />
              <span>Browser extensions, view source or find in page are part of the product.</span>
            </li>
          </ul>
          <a class="card-link" href="/guide/is-gesso-for-you">Is Gesso for your project?</a>
        </div>
      </div>
    </section>

    <section class="start">
      <div class="start-card">
        <svg class="mark" viewBox="0 0 64 64" role="img" aria-label="Gesso">
          <defs>
            <clipPath id="gesso-home-canvas"><rect width="64" height="64" rx="12" /></clipPath>
          </defs>
          <rect width="64" height="64" rx="12" fill="#BE9A6E" />
          <path
            clip-path="url(#gesso-home-canvas)"
            fill="#F7F3EA"
            d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
        </svg>
        <h2>A running project in about five minutes</h2>
        <p class="lede">The scaffold writes the worker, the shell and the first component, then gets out of the way.</p>
        <p class="command"><span class="prompt">$</span>pnpm create:app my-app</p>
        <div class="actions">
          <a class="button button-primary" href="/guide/installation">
            Get started
            <svg class="arrow" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </a>
          <a class="button button-bare" href="/guide/counter">Your first component</a>
        </div>
      </div>
    </section>

    <footer class="colophon">
      <div class="colophon-grid">
        <div class="colophon-brand">
          <svg class="mark mark-small" viewBox="0 0 64 64" role="img" aria-label="Gesso">
            <defs>
              <clipPath id="gesso-foot-canvas"><rect width="64" height="64" rx="12" /></clipPath>
            </defs>
            <rect width="64" height="64" rx="12" fill="#BE9A6E" />
            <path
              clip-path="url(#gesso-foot-canvas)"
              fill="#F7F3EA"
              d="M0 40H16V28H32V16H48V4H64V24H48V36H32V48H16V60H0Z" />
          </svg>
          <p>The chalk ground brushed onto raw linen so it will take paint.</p>
        </div>
        <div>
          <p class="colophon-head">Learn</p>
          <a href="/guide/what-is-gesso">What Gesso is</a>
          <a href="/guide/installation">Installation</a>
          <a href="/guide/counter">Your first component</a>
        </div>
        <div>
          <p class="colophon-head">Build</p>
          <a href="/layout/flex">Layout</a>
          <a href="/components/">Components</a>
          <a href="/tooling/devtools">Devtools</a>
        </div>
        <div>
          <p class="colophon-head">Decide</p>
          <a href="/guide/why-gesso">How it compares</a>
          <a href="/guide/is-gesso-for-you">Is Gesso for you?</a>
          <a href="/reference/api">API index</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home {
  --edge: 60px;
  --measure: 1320px;
  --linen-band: #efe7d7;
  --panel-line: var(--vp-c-divider);
  padding-bottom: 0;
}

.dark .home {
  --linen-band: #1c1f26;
}

.home section {
  padding-inline: var(--edge);
}

/* Sections and figures */

.eyebrow {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0;
  font-size: 12.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--gesso-linen-shade);
}

.dark .eyebrow {
  color: var(--gesso-linen);
}

.eyebrow-linen {
  color: var(--gesso-linen);
}

.stroke-glyph {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  fill: var(--gesso-linen);
}

h1,
h2,
h3 {
  margin: 0;
  font-family: var(--gesso-font-display);
  font-weight: 300;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  text-wrap: pretty;
}

h1 {
  font-size: 84px;
  line-height: 0.98;
}

h2 {
  font-size: 50px;
  line-height: 1.08;
}

h3 {
  font-size: 27px;
  line-height: 1.2;
}

.lede {
  margin: 0;
  font-size: 19px;
  line-height: 1.62;
  color: var(--vp-c-text-2);
  text-wrap: pretty;
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 620px;
}

.section-head-wide {
  max-width: 680px;
}

/* Buttons */

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
}

.button {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  padding: 14px 26px;
  font-size: 15.5px;
  font-weight: 500;
  border-radius: 8px;
  transition:
    background-color 0.18s,
    border-color 0.18s,
    color 0.18s;
}

.button-primary {
  color: var(--vp-button-brand-text);
  background: var(--vp-button-brand-bg);
}

.button-primary:hover {
  background: var(--vp-button-brand-hover-bg);
}

.button-quiet {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
}

.button-quiet:hover {
  border-color: var(--gesso-linen);
}

.button-bare {
  padding-inline: 4px;
  font-weight: 400;
  color: var(--vp-c-text-1);
}

.button-bare:hover {
  color: var(--vp-c-brand-1);
}

.arrow {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Hero */

.hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 72px;
  align-items: center;
  max-width: var(--measure);
  margin-inline: auto;
  padding-block: 104px 96px;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.hero-copy .lede {
  max-width: 490px;
}

.panel {
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--panel-line);
  border-radius: 16px;
}

.hero-panel .panel {
  box-shadow: 0 24px 48px -28px rgb(22 24 29 / 28%);
}

.panel-head {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px;
  border-bottom: 1px solid var(--panel-line);
}

.panel-label {
  font-size: 12.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gesso-linen-shade);
}

.dark .panel-label {
  color: var(--gesso-linen);
}

.panel-meta {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 12.5px;
  color: var(--vp-c-text-2);
}

.dot {
  width: 7px;
  height: 7px;
  background: var(--vp-c-brand-1);
  border-radius: 999px;
}

.panel-foot {
  margin: 0;
  padding: 13px 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  border-top: 1px solid var(--panel-line);
}

.panel-foot code {
  padding: 2px 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
  background: var(--vp-c-bg-alt);
  border-radius: 4px;
}

/* A live example is framed by its own panel here, so it drops the
   border and margin it carries inside a documentation page. */
.panel :deep(.live-example) {
  margin: 0;
  border: 0;
  border-radius: 0;
}

/* Proof */

.proof {
  padding-block: 0;
}

.band {
  display: flex;
  flex-direction: column;
  gap: 40px;
  max-width: var(--measure);
  margin-inline: auto;
  padding: 76px 60px;
  background: var(--gesso-ink);
  border-radius: 20px;

  /* The band is ink in both appearances, so the default theme's
     variables are remapped inside it rather than around it: the demo's
     own controls are built from these. */
  --vp-c-text-1: #f7f3ea;
  --vp-c-text-2: #a69f91;
  --vp-c-divider: #2e323c;
  --vp-c-bg-soft: #1e2128;
  --vp-c-default-soft: #262a33;
}

.dark .band {
  background: #101216;
}

.band-head {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  max-width: 640px;
  margin-inline: auto;
  text-align: center;
}

.band h2,
.band .lede {
  color: #f7f3ea;
}

.band .lede {
  color: #a69f91;
}

.band :deep(.thread-demo) {
  margin: 0;
}

.band :deep(.thread-demo-canvas) {
  height: 196px;
}

.band :deep(.thread-demo-controls) {
  justify-content: center;
}

/* Pillars */

.pillars {
  display: flex;
  flex-direction: column;
  gap: 52px;
  max-width: var(--measure);
  margin-inline: auto;
  padding-block: 100px 96px;
}

.pillar-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--panel-line);
  border-radius: 14px;
}

.card p {
  flex-grow: 1;
  margin: 0;
  font-size: 15px;
  line-height: 1.62;
  color: var(--vp-c-text-2);
}

.card-link {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  font-size: 14.5px;
  color: var(--vp-c-brand-1);
}

.card-link::after {
  content: '→';
}

.figure {
  display: flex;
  gap: 8px;
  height: 96px;
  padding: 14px;
  background: var(--vp-c-bg-alt);
  border-radius: 10px;
}

.figure-layout .fig-outline {
  flex-grow: 1;
  border: 1.5px dashed #c9b694;
  border-radius: 6px;
}

.figure-layout .fig-stack {
  display: flex;
  flex-direction: column;
  flex-grow: 2;
  gap: 8px;
}

.figure-layout .fig-solid {
  flex-grow: 1;
  background: var(--gesso-linen);
  border-radius: 6px;
}

.figure-layout .fig-pair {
  display: flex;
  flex-grow: 1;
  gap: 8px;
}

.figure-layout .fig-pair span {
  flex-grow: 1;
  background: #dcc9a8;
  border-radius: 6px;
}

.figure-text {
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  overflow: hidden;
}

.figure-text span {
  font-size: 17px;
  white-space: nowrap;
  color: var(--vp-c-text-1);
}

.figure-text span:nth-child(2) {
  color: var(--gesso-linen-shade);
}

.dark .figure-text span:nth-child(2) {
  color: var(--gesso-linen);
}

.figure-parts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.figure-parts span {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--panel-line);
  border-radius: 5px;
}

.figure-parts .fill-brand {
  background: var(--vp-c-brand-1);
  border-color: transparent;
}

.figure-parts .fill-linen {
  background: #dcc9a8;
  border-color: transparent;
}

/* The model */

.model {
  display: flex;
  flex-direction: column;
  gap: 44px;
  max-width: var(--measure);
  margin-inline: auto;
  padding-bottom: 100px;
}

.model-grid {
  display: grid;
  grid-template-columns: 1.35fr 0.65fr;
  gap: 24px;
  align-items: start;
}

.code-panel {
  overflow: hidden;
  border-radius: 14px;
}

/* The snippet comes from `index.md` through `<Content />`, so it
   arrives with the site's own code-block markup and has to be undone
   from a document block into a panel that fills its grid cell. */
.code-panel :deep(div[class*='language-']) {
  height: 100%;
  margin: 0;
  border-radius: 14px;
}

.result-panel {
  display: flex;
  flex-direction: column;
}

.result-panel :deep(.live-example-host) {
  background: transparent;
}

/* Where it fits */

.fit {
  max-width: var(--measure);
  margin-inline: auto;
  padding-bottom: 100px;
}

.fit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 72px;
  padding-top: 56px;
  border-top: 1px solid var(--panel-line);
}

.fit-against {
  padding-left: 72px;
  border-left: 1px solid var(--panel-line);
}

.fit h3 {
  font-size: 34px;
  line-height: 1.15;
}

.fit-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.fit-list li {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  font-size: 16px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.fit-list .stroke-glyph,
.square-glyph {
  margin-top: 5px;
}

.square-glyph {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--vp-c-border);
  border-radius: 3px;
}

.fit-against .card-link {
  margin-top: 24px;
}

/* Start */

.start {
  max-width: var(--measure);
  margin-inline: auto;
  padding-bottom: 104px;
}

.start-card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  padding: 72px 60px;
  text-align: center;
  background: var(--linen-band);
  border-radius: 18px;
}

.start-card .lede {
  max-width: 540px;
}

.mark {
  width: 34px;
  height: 34px;
}

.command {
  display: inline-flex;
  gap: 14px;
  align-items: center;
  margin: 0;
  padding: 13px 18px;
  font-family: var(--vp-font-family-mono);
  font-size: 14.5px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 9px;
}

.prompt {
  color: var(--gesso-linen-shade);
}

.dark .prompt {
  color: var(--gesso-linen);
}

/* Colophon */

.colophon {
  padding-block: 48px 64px;
  padding-inline: var(--edge);
  border-top: 1px solid var(--panel-line);
}

.colophon-grid {
  display: grid;
  grid-template-columns: 1.4fr repeat(3, 1fr);
  gap: 40px;
  max-width: var(--measure);
  margin-inline: auto;
}

.colophon-brand {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.colophon-brand p {
  max-width: 260px;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.mark-small {
  width: 22px;
  height: 22px;
}

.colophon-grid div a {
  display: block;
  margin-top: 11px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.colophon-grid div a:hover {
  color: var(--vp-c-brand-1);
}

.colophon-head {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gesso-linen-shade);
}

.dark .colophon-head {
  color: var(--gesso-linen);
}

/* Narrower windows */

@media (width <= 1100px) {
  .home {
    --edge: 40px;
  }

  h1 {
    font-size: 64px;
  }

  h2 {
    font-size: 42px;
  }

  .hero {
    gap: 48px;
  }

  .pillar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 860px) {
  .home {
    --edge: 24px;
  }

  h1 {
    font-size: 50px;
  }

  h2 {
    font-size: 34px;
  }

  .fit h3 {
    font-size: 28px;
  }

  .lede {
    font-size: 17px;
  }

  .hero,
  .model-grid,
  .fit-grid,
  .pillar-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero {
    padding-block: 56px 64px;
  }

  .pillars,
  .model,
  .fit,
  .start {
    padding-bottom: 64px;
  }

  .pillars {
    padding-top: 64px;
    gap: 36px;
  }

  .band {
    gap: 28px;
    padding: 48px 24px;
    border-radius: 16px;
  }

  .fit-against {
    padding-top: 32px;
    padding-left: 0;
    border-top: 1px solid var(--panel-line);
    border-left: 0;
  }

  .fit-grid {
    gap: 32px;
  }

  .start-card {
    padding: 48px 24px;
  }

  .command {
    width: 100%;
    justify-content: center;
  }

  .actions .button {
    flex-grow: 1;
    justify-content: center;
  }

  .colophon-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
  }
}
</style>
