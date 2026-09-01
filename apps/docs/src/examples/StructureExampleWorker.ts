import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Shipment } from './StructureExample';

/** The render worker behind `<LiveExample id="structure" />`. */
renderRoot(exampleRoot(createComponent(Shipment, {})));
