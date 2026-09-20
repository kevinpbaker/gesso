import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { RichText } from './RichTextExample';

/** The render worker behind `<LiveExample id="rich-text" />`. */
renderRoot(exampleRoot(createComponent(RichText, {})));
