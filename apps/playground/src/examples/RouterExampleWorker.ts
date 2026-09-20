import { renderRoot } from 'gesso-framework';
import { ROUTES, RouterExampleApp } from './RouterExampleApp';

/**
 * Render worker for the routing example.
 *
 * The routes are declared here, on this thread, because a route names
 * a component class and a component class cannot be posted anywhere.
 * The shell holds none of them; it forwards a url in and performs the
 * pushes this side asks for.
 */
renderRoot(RouterExampleApp).useRoutes(ROUTES);
