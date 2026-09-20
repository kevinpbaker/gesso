import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Feed } from './VirtualizationExample';

/** The render worker behind `<LiveExample id="virtualization" />`. */
renderRoot(exampleRoot(createComponent(Feed, {})));
