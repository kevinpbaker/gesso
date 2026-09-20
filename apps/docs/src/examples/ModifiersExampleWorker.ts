import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { ModifierSurface } from './ModifiersExample';

/** The render worker behind `<LiveExample id="modifiers" />`. */
renderRoot(exampleRoot(createComponent(ModifierSurface, {})));
