import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Workspace } from './ContextMenusExample';

/** The render worker behind `<LiveExample id="contextmenus" />`. */
renderRoot(exampleRoot(createComponent(Workspace, {})));
