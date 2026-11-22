import type { UiNode } from 'gesso-core';

import type { ServedChannel } from '../channel/serveChannels';
import type { WorkerHandle } from '../worker/WorkerPorts';
import {
  agentAnswer,
  agentSurface,
  type AgentAnswer,
  type AgentConfirmation,
  type AgentConfirmResult
} from './AgentSurface';
import { AGENT_PORT, combineSurfaces, remoteSurface, serveAgentPort, type AgentConfirm } from './remote';
import { toolSurface, type AgentToolDefinition } from './tools';
import { uiSurface, type UiHost } from './ui';

/** What a thread that draws the application can offer an agent. */
export interface ApplicationAgentParts {
  /** The channels fed from this thread. */
  readonly channels: () => readonly ServedChannel[];
  /** The workers behind it, each asked over an agent port of its own. */
  readonly workers: () => Iterable<WorkerHandle>;
  /** The screen, once the application has started. */
  readonly ui: () => UiHost | undefined;
  /** Tools the application offers of its own accord (`useAgentTools`). */
  readonly tools?: () => readonly AgentToolDefinition[];
  /** How the application asks the person itself, on its own screen (`useAgentConfirm`). */
  readonly confirm?: () => AgentConfirmAsk | undefined;
}

/** What an application's own question to the person is given beside the request; see `AgentConfirmAsk`. */
export interface AgentConfirmContext {
  /** A service of the running application, as a component injects it: `OverlayService`, to open a dialog. */
  inject<T extends object>(service: new () => T): T;
  /** The application's outermost content. A dialog given it as its environment draws in the app's theme. */
  readonly environment: UiNode | null;
  /** Aborted when the question is withdrawn because nobody answered in time: close the dialog then. */
  readonly signal: AbortSignal;
}

/**
 * Asks the person, on the application's own screen, whether an AI
 * agent's `@confirm` command may be sent: `renderRoot(App).useAgentConfirm(ask)`.
 * `gesso-components`' `agentConfirmDialog()` is one, drawn with its
 * `Dialog`. Answer `approved`, `declined`, or `{ unavailable: why }`.
 */
export type AgentConfirmAsk = (request: AgentConfirmation, context: AgentConfirmContext) => AgentConfirmResult;

/**
 * How long an in-app question waits for the person, in milliseconds,
 * before it is withdrawn and the agent told nobody answered: under the
 * two minutes the page gives a call, so the agent hears why.
 */
export const AGENT_CONFIRM_MS = 110_000;

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
  return serveAgentPort(port, pageConfirm => {
    // The application's own question, on its screen, when it has one; else the page's, as before.
    const confirm: AgentConfirm = request => {
      const ask = parts.confirm?.();
      const context = parts.ui()?.agentContext?.();
      if (ask === undefined || context === undefined) {
        return pageConfirm(request);
      }
      if (context.hidden) {
        return { unavailable: "the app's window is hidden, so it cannot show the question" };
      }
      return askInApp(ask, request, context);
    };
    const workers = [...parts.workers()]
      .filter(worker => worker.spawned)
      .map(worker => remoteSurface(worker.open(AGENT_PORT), { confirm }));
    return combineSurfaces([
      agentSurface(parts.channels(), { confirm }),
      ...workers,
      uiSurface(parts.ui, { confirm }),
      ...(parts.tools === undefined ? [] : [toolSurface(parts.tools)])
    ]);
  });
}

/** An in-app question, withdrawn when nobody has answered in `AGENT_CONFIRM_MS`. */
async function askInApp(
  ask: AgentConfirmAsk,
  request: AgentConfirmation,
  context: { inject<T extends object>(service: new () => T): T; readonly environment: UiNode | null }
): Promise<AgentAnswer> {
  const withdrawn = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<AgentAnswer>(resolve => {
    timer = setTimeout(() => {
      withdrawn.abort();
      resolve({
        unavailable: `nobody answered the question on the app's screen in ${AGENT_CONFIRM_MS / 1000} seconds`
      });
    }, AGENT_CONFIRM_MS);
  });
  try {
    const asked = Promise.resolve(
      ask(request, { inject: context.inject, environment: context.environment, signal: withdrawn.signal })
    ).then(agentAnswer);
    return await Promise.race([asked, late]);
  } finally {
    clearTimeout(timer);
  }
}
