import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { MailRail, RAIL_ROUTES } from './NavigationRailExample';

/**
 * The render worker behind `<LiveExample id="navigationrail" />`.
 *
 * The routes are registered here, as the routing example's are, because
 * a route holds a component and a component cannot cross `postMessage`.
 */
renderRoot(exampleRoot(createComponent(MailRail, {}))).useRoutes(RAIL_ROUTES);
