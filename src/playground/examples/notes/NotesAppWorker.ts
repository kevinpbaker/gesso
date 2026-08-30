import { serveChannels } from '../../../framework/channel/serveChannels';
import { Notes } from './NotesContract';
import { NotesDomain } from './NotesDomain';
import { OpfsNotesRepository } from './OpfsNotesRepository';
import { SEED_NOTES } from './NotesSeed';
import { NotesViewModel } from './NotesViewModel';

/**
 * The notes application, on its own thread.
 *
 * Four lines of wiring over three plain classes, and one call that
 * publishes the result. Above `serveChannels` there is no framework
 * import in this file's dependency graph at all — no decorator, no
 * runtime — so every layer under it is testable with bare vitest.
 *
 * The repository is the OPFS one, so notes survive a reload. Swapping
 * it for `InMemoryNotesRepository` is this one line: the domain and
 * the view model never learn which they were given, which is the whole
 * point of the seam and the reason their specs still run in node.
 */
const repository = new OpfsNotesRepository(SEED_NOTES);
const domain = new NotesDomain(repository);
const view = new NotesViewModel(domain);

serveChannels([
  {
    token: Notes,
    source: {
      view: { rows: view.rows, open: view.open },
      commands: {
        open: (id: string) => domain.select(id),
        create: () => domain.create(),
        remove: (id: string) => domain.remove(id),
        setTitle: (title: string) => domain.setTitle(title),
        setBody: (body: string) => domain.setBody(body)
      }
    }
  }
]);
