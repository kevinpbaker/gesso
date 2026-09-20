import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Activity } from './RecipeFeedExample';

/** The render worker behind `<LiveExample id="recipefeed" />`. */
renderRoot(exampleRoot(createComponent(Activity, {})));
