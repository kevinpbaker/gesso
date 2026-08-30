import { renderRoot } from '@gesso/framework';
import { NotesApp } from './NotesExampleApp';
import { Notes } from './notes/NotesContract';

/**
 * Render worker for the notes example.
 *
 * The UI and the text editing live here; the notebook does not. The
 * channel is registered with no worker of its own, so it resolves to
 * whichever application worker the shell spawned — this file does not
 * need to know which, or where.
 */
renderRoot(NotesApp).useChannel(Notes);
