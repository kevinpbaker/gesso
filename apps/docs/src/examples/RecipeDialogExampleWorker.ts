import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { NoteList } from './RecipeDialogExample';

/** The render worker behind `<LiveExample id="recipedialog" />`. */
renderRoot(exampleRoot(createComponent(NoteList, {})));
