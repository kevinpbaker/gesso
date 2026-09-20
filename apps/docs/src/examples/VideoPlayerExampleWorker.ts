import { createComponent, renderRoot } from 'gesso-framework';
import { ClipResolver, Player } from './VideoPlayerExample';
import { exampleRoot } from './ExampleRoot';

/**
 * The render worker behind `<LiveExample id="video-player" />`.
 *
 * The same generated clip `<LiveExample id="video" />` uses, for the
 * same reason: a decoder is a function, no function crosses a
 * `postMessage`, and the thread that decodes is the one that builds
 * it.
 */
renderRoot(exampleRoot(createComponent(Player, {}))).useMedia({ videoResolver: new ClipResolver() });
