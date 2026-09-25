import { createComponent, renderRoot } from 'gesso-framework';
import { Bar } from './MenuBarExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="menubar" />`. */
renderRoot(exampleRoot(createComponent(Bar, {})));
