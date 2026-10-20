import { renderRoot } from 'gesso-framework';
import { ROUTES, WorkbenchApp } from './WorkbenchApp';

/** Render worker for the component workbench. The whole app lives here. */
renderRoot(WorkbenchApp).useRoutes(ROUTES);
