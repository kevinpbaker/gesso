import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { AppearanceSetting } from './RecipeAppearanceExample';

/** The render worker behind `<LiveExample id="recipeappearance" />`. */
renderRoot(exampleRoot(createComponent(AppearanceSetting, {})));
