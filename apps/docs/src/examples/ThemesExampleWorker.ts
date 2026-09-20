import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Themes } from './ThemesExample';

/** The render worker behind `<LiveExample id="themes" />`. */
renderRoot(exampleRoot(createComponent(Themes, {})));
