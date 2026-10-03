import type { ServedChannel } from '../channel/serveChannels';
import type { WorkerHandle } from '../worker/WorkerPorts';
import { agentSurface } from './AgentSurface';
import { AGENT_PORT, combineSurfaces, remoteSurface, serveAgentPort } from './remote';
import { uiSurface, type UiHost } from './ui';

/** What a thread that draws the application can offer an agent. */
export interface ApplicationAgentParts {
  /** The channels fed from this thread. */
  readonly channels: () => readonly ServedChannel[];
  /** The workers behind it, each asked over an agent port of its own. */
  readonly workers: () => Iterable<WorkerHandle>;
  /** The screen, once the application has started. */
  readonly ui: () => UiHost | undefined;
}

/**
 * Answers an agent port with the whole application: the channels this
 * thread feeds, whatever each worker behind it serves, and the screen.
 *
 * The thread that draws is the one that knows all three, which is the
 * render worker in the worker configuration and the page in the single
 * thread one; both answer with this. The screen comes last, so a
 * channel tool keeps its name.
 */
export function serveApplicationAgent(port: MessagePort, parts: ApplicationAgentParts): () => void {
  return serveAgentPort(port, confirm => {
    const workers = [...parts.workers()]
      .filter(worker => worker.spawned)
      .map(worker => remoteSurface(worker.open(AGENT_PORT), { confirm }));
    return combineSurfaces([agentSurface(parts.channels(), { confirm }), ...workers, uiSurface(parts.ui)]);
  });
}
