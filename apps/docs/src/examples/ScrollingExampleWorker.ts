import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { ScrollingList } from './ScrollingExample';

/** The render worker behind `<LiveExample id="scrolling" />`. */
renderRoot(exampleRoot(createComponent(ScrollingList, {})));
