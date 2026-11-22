import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Board } from './ShortcutSheetExample';

/** The render worker behind `<LiveExample id="shortcutsheet" />`. */
renderRoot(exampleRoot(createComponent(Board, {})));
