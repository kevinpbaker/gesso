import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { describeChannel } from '../channel/ChannelSchema';
import { defineChannel } from '../channel/ChannelToken';
import { serve } from '../channel/serveChannels';
import { grantAllows, protectedResourceMetadataUrl, type AgentGrant } from './auth';
import { agentSurface } from './AgentSurface';
import { combineSurfaces } from './remote';
import { mcpHandler, type McpCaller } from './mcp';
import { uiSurface } from './ui';

const Issues = defineChannel('issues', {
  view: { count: 0 },
  commands: {} as { add(): void; purge(): void },
  queries: {} as { total(): number }
});
describeChannel(Issues, {
  view: { type: 'object', properties: { count: { type: 'number' } } },
  commands: {
    add: { description: 'Adds one.', parameters: [], input: { type: 'object', properties: {} } },
    purge: {
      description: 'Deletes every issue.',
      parameters: [],
      input: { type: 'object', properties: {} },
      scope: 'admin'
    }
  },
  queries: { total: { description: 'How many.', parameters: [], input: { type: 'object', properties: {} } } }
});

const Billing = defineChannel('billing', { view: { owed: 0 } });

function server(grants: Record<string, AgentGrant>, seen: (McpCaller | null)[] = []) {
  const count = new BehaviorSubject(0);
  const surface = combineSurfaces([
    agentSurface(
      [
        serve(Issues, {
          view: { count },
          commands: { add: () => count.next(count.value + 1), purge: () => count.next(0) },
          queries: { total: () => count.value }
        }),
        serve(Billing, { view: { owed: new BehaviorSubject(12) } })
      ],
      { quietMs: 1, settleMs: 20 }
    ),
    uiSurface(() => undefined)
  ]);
  const handle = mcpHandler(surface, {
    name: 'tracker',
    authorize: request => grants[request.headers.get('authorization') ?? ''] ?? null,
    oauth: { resource: 'https://tracker.example.com/mcp', authorizationServers: ['https://auth.example.com'] },
    around: (caller, run) => (seen.push(caller), run())
  });
  const post = (token: string, body: object, session?: string) =>
    handle(
      new Request('https://tracker.example.com/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: token,
          ...(session === undefined ? {} : { 'mcp-session-id': session })
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body })
      })
    );
  return { handle, post, count };
}

const grants = {
  'Bearer reader': { subject: 'ada', scopes: ['issues:read'] },
  'Bearer writer': { subject: 'ben', scopes: ['issues:write'] },
  'Bearer admin': { subject: 'cy', scopes: ['*'] }
};

describe('scopes', () => {
  it('are held exactly, through *, or as the write a read is part of', () => {
    expect(grantAllows({ scopes: ['issues:write'] }, 'issues:read')).toBe(true);
    expect(grantAllows({ scopes: ['issues:read'] }, 'issues:write')).toBe(false);
    expect(grantAllows({ scopes: ['*'] }, 'admin')).toBe(true);
    expect(grantAllows({ scopes: [] }, undefined)).toBe(true);
  });
});

describe('mcpHandler with authorize', () => {
  it('refuses a request it grants nothing, and says where to get a token', async () => {
    const response = await server(grants).post('Bearer nobody', { method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://tracker.example.com/.well-known/oauth-protected-resource/mcp"'
    );
  });

  it('answers the protected resource metadata to anyone, with every scope the tools need', async () => {
    const response = await server(grants).handle(
      new Request('https://tracker.example.com/.well-known/oauth-protected-resource/mcp')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: 'https://tracker.example.com/mcp',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['admin', 'billing:read', 'design', 'issues:read', 'issues:write', 'screen']
    });
    expect(protectedResourceMetadataUrl('https://x.example/')).toBe(
      'https://x.example/.well-known/oauth-protected-resource'
    );
  });

  it('lists only the tools and resources a grant holds', async () => {
    const { post } = server(grants);
    const names = async (token: string) =>
      (
        (await (await post(token, { method: 'tools/list' })).json()) as { result: { tools: { name: string }[] } }
      ).result.tools.map(tool => tool.name);
    expect(await names('Bearer reader')).toEqual(['issues_view', 'issues_total']);
    expect(await names('Bearer writer')).toEqual(['issues_view', 'issues_add', 'issues_total']);
    expect(await names('Bearer admin')).toContain('ui_press');
    const resources = (await (await post('Bearer reader', { method: 'resources/list' })).json()) as {
      result: { resources: { uri: string }[] };
    };
    expect(resources.result.resources.map(resource => resource.uri)).toEqual(['gesso://issues/view']);
    const read = (await (
      await post('Bearer reader', { method: 'resources/read', params: { uri: 'gesso://billing/view' } })
    ).json()) as {
      error?: unknown;
    };
    expect(read.error).toBeDefined();
  });

  it('refuses a call outside the grant with 403 and the scope to ask for, and lets one inside it through', async () => {
    const { post, count } = server(grants);
    const refused = await post('Bearer reader', {
      method: 'tools/call',
      params: { name: 'issues_add', arguments: {} }
    });
    expect(refused.status).toBe(403);
    expect(refused.headers.get('www-authenticate')).toBe(
      'Bearer error="insufficient_scope", scope="issues:write", resource_metadata="https://tracker.example.com/.well-known/oauth-protected-resource/mcp"'
    );
    expect(((await refused.json()) as { error: { message: string } }).error.message).toBe(
      'Calling issues_add needs the scope issues:write, which this token does not have.'
    );
    expect(count.value).toBe(0);

    const purge = await post('Bearer writer', {
      method: 'tools/call',
      params: { name: 'issues_purge', arguments: {} }
    });
    expect(purge.status).toBe(403);

    const added = await post('Bearer writer', { method: 'tools/call', params: { name: 'issues_add', arguments: {} } });
    expect(added.status).toBe(200);
    expect(count.value).toBe(1);
  });

  it('tells `around` what the request may do', async () => {
    const seen: (McpCaller | null)[] = [];
    const { post } = server(grants, seen);
    const hello = await post('Bearer writer', {
      method: 'initialize',
      params: { clientInfo: { name: 'Claude Code' } }
    });
    await post('Bearer writer', { method: 'ping' }, hello.headers.get('mcp-session-id')!);
    expect(seen[1]).toMatchObject({
      client: { name: 'Claude Code' },
      grant: { subject: 'ben', scopes: ['issues:write'] }
    });
  });
});
