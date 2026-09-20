import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { EXAMPLE_ROUTES, RoutingExample } from './RoutingExample';

// #region register
/**
 * The render worker behind `<LiveExample id="routing" />`.
 *
 * The routes are declared here, in the worker, because a route holds a
 * component class and a class cannot cross `postMessage`. The shell
 * never sees one: the only thing that crosses is a url.
 */
renderRoot(exampleRoot(createComponent(RoutingExample, {}))).useRoutes(EXAMPLE_ROUTES);
// #endregion register
