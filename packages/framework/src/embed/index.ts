/**
 * `gesso-framework/embed`: a Gesso app as one part of a page that is
 * not Gesso's.
 *
 * `embedSurface` mounts an app into an element with the defaults an app
 * sharing the page needs: the address bar, the title and the leave
 * warning stay the page's, and Tab can leave. `hostChannels` serves the
 * page's own state to the app as channels, from the page's thread.
 * `gesso-react` is these two as a component and a hook.
 *
 *   const surface = embedSurface(element, {
 *     renderWorker: () => new Worker(new URL('./grid.render.worker.ts', import.meta.url), { type: 'module' }),
 *     channels: [serve(GridFilter, { view: { text }, commands: { open: id => go(id) } })]
 *   });
 *
 * A separate entry so a shell that does not embed carries none of it,
 * and because serving channels brings RxJS onto the page's thread.
 */
export { embedSurface, type EmbedOptions, type EmbeddedSurface } from './embedSurface';
export { hostChannels, type HostChannels } from './hostChannels';
export { serve, type ServedChannel } from '../channel/serveChannels';
