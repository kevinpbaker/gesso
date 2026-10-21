import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Inbox } from './DrawerExample';

/** The render worker behind `<LiveExample id="drawer" />`. */
renderRoot(exampleRoot(createComponent(Inbox, {})));
