import { renderRoot } from '../../framework/app/worker/renderRoot';
import { NotesApp, NotesStore } from './NotesExampleApp';

/**
 * Render worker for the notes example: the UI, the text editing and
 * the store all live here. The main thread forwards input and hosts
 * the editing proxy.
 */
renderRoot(NotesApp).useStore(NotesStore);
