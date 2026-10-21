import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { ReleaseNote } from './RichTextEditorExample';

/** The render worker behind `<LiveExample id="richtexteditor" />`. */
renderRoot(exampleRoot(createComponent(ReleaseNote, {})));
