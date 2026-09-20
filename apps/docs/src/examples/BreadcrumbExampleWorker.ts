import { createComponent, renderRoot } from 'gesso-framework';
import { Trail } from './BreadcrumbExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="breadcrumb" />`. */
renderRoot(exampleRoot(createComponent(Trail, {})));
