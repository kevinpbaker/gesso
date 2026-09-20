import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { SettingsScreen } from './RecipeSettingsExample';

/** The render worker behind `<LiveExample id="recipesettings" />`. */
renderRoot(exampleRoot(createComponent(SettingsScreen, {})));
