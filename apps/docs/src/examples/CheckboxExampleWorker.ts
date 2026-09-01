import { createComponent, renderRoot } from '@gesso/framework';
import { Preferences } from './CheckboxExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="checkbox" />`. */
renderRoot(exampleRoot(createComponent(Preferences, {})));
