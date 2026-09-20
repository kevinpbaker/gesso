import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Requests } from './RecipeTableExample';

/** The render worker behind `<LiveExample id="recipetable" />`. */
renderRoot(exampleRoot(createComponent(Requests, {})));
