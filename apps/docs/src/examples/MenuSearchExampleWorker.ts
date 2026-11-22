import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { AssignTo } from './MenuSearchExample';

/** The render worker behind `<LiveExample id="menusearch" />`. */
renderRoot(exampleRoot(createComponent(AssignTo, {})));
