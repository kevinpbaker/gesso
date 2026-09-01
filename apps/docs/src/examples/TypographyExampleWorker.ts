import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { TypeScale } from './TypographyExample';

/** The render worker behind `<LiveExample id="typography" />`. */
renderRoot(exampleRoot(createComponent(TypeScale, {})));
