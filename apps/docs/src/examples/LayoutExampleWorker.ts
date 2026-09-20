import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Layout } from './LayoutExample';

/** The render worker behind `<LiveExample id="layout" />`. */
renderRoot(exampleRoot(createComponent(Layout, {})));
