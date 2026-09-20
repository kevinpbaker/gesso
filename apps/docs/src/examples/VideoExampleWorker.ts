import { createComponent, renderRoot } from 'gesso-framework';
import { ClipResolver, Player } from './VideoExample';
import { exampleRoot } from './ExampleRoot';

/**
 * The render worker behind `<LiveExample id="video" />`.
 *
 * The decoder is declared here, in the worker entry, for the reason
 * an image resolver is: it is a function, no function crosses a
 * `postMessage`, and the thread that decodes is the one that builds
 * it. It is in place before the tree is, which is what a `Video`
 * needs.
 */
renderRoot(exampleRoot(createComponent(Player, {}))).useMedia({ videoResolver: new ClipResolver() });
