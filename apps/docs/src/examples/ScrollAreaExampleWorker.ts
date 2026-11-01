import { createComponent, renderRoot } from 'gesso-framework';
import { OrderList } from './ScrollAreaExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="scrollarea" />`. */
renderRoot(exampleRoot(createComponent(OrderList, {})));
