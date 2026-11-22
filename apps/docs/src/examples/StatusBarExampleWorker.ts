import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Editor } from './StatusBarExample';

/** The render worker behind `<LiveExample id="statusbar" />`. */
renderRoot(exampleRoot(createComponent(Editor, {})));
