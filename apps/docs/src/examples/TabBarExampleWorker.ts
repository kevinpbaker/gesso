import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Editor } from './TabBarExample';

/** The render worker behind `<LiveExample id="tabbar" />`. */
renderRoot(exampleRoot(createComponent(Editor, {})));
