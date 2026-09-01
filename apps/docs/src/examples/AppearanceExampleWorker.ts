import { createComponent, renderRoot } from '@gesso/framework';
import { Appearance } from './AppearanceExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="appearance" />`. */
renderRoot(exampleRoot(createComponent(Appearance, {})));
