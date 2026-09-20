import { createComponent, renderRoot } from 'gesso-framework';
import { People, portraitResolver } from './AvatarExample';
import { exampleRoot } from './ExampleRoot';

/**
 * The render worker behind `<LiveExample id="avatar" />`.
 *
 * The resolver is declared here, in the worker entry, because a
 * resolver is a function and no function crosses a `postMessage`: the
 * thread that will fetch and decode is the one that builds it. It is
 * in place before the tree is, which is what an `Avatar` with a `src`
 * needs.
 */
renderRoot(exampleRoot(createComponent(People, {}))).useMedia({ resolver: portraitResolver() });
