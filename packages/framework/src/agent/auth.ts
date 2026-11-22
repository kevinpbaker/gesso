import { SCOPE_META, type AgentResource, type AgentSurfaceLike, type AgentTool } from './AgentSurface';

/**
 * What a request may do: who it is for, and the scopes it holds.
 *
 * Scopes are the tools' own (`SCOPE_META`): `<channel>:read` reads a
 * channel's view, its queries and its resource; `<channel>:write` sends
 * its commands and reads it too; `screen` operates the screen; `design`
 * reads the theme and draws frames; `app:read` and `app:write` are the
 * application's own tools; `*` is everything. A tool that names no scope
 * needs none beyond being let in.
 */
export interface AgentGrant {
  /** Who the request acts for, as the authorization server named them: for `around` and the record. */
  readonly subject?: string;
  readonly scopes: readonly string[];
}

/** A grant of everything: what a request has with no `authorize`, or with the one `token`. */
export const FULL_GRANT: AgentGrant = { scopes: ['*'] };

/**
 * Where agents get a token for this server, for MCP's authorization
 * flow. Gesso is the resource server only: it says where to go
 * (RFC 9728's protected resource metadata, pointed at by the 401's
 * `WWW-Authenticate`), and `authorize` checks what comes back.
 */
export interface McpOAuthOptions {
  /** This server's URL as a resource, which a token's audience must name: `https://tracker.example.com/mcp`. */
  readonly resource: string;
  /** The authorization servers that issue tokens for it. */
  readonly authorizationServers: readonly string[];
  /** Scopes to list beside the tools' own, which are listed whatever this says. */
  readonly scopesSupported?: readonly string[];
  /** A name a client may show for the resource. */
  readonly resourceName?: string;
}

/** The path RFC 9728 puts a resource's metadata at, before the resource's own path. */
export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';

/** Whether a grant holds a scope: exactly, through `*`, or as the `:write` a `:read` is part of. */
export function grantAllows(grant: AgentGrant, scope: string | undefined): boolean {
  if (scope === undefined || grant.scopes.includes('*') || grant.scopes.includes(scope)) {
    return true;
  }
  return scope.endsWith(':read') && grant.scopes.includes(`${scope.slice(0, -':read'.length)}:write`);
}

/** The scope a tool or a resource says it needs, if it says one. */
export function scopeOf(item: Pick<AgentTool, '_meta'> | Pick<AgentResource, '_meta'>): string | undefined {
  const scope = item._meta?.[SCOPE_META];
  return typeof scope === 'string' && scope !== '' ? scope : undefined;
}

/**
 * The protected resource metadata (RFC 9728) for a surface: the
 * resource, its authorization servers, the bearer method, and every
 * scope its tools and resources need. `mcpHandler` answers it at
 * `PROTECTED_RESOURCE_PATH`; a server that routes that path elsewhere
 * answers it with this.
 */
export async function protectedResourceMetadata(
  surface: AgentSurfaceLike,
  oauth: McpOAuthOptions
): Promise<Record<string, unknown>> {
  const [tools, resources] = await Promise.all([surface.tools(), surface.resources()]);
  const scopes = new Set(oauth.scopesSupported ?? []);
  for (const item of [...tools, ...resources]) {
    const scope = scopeOf(item);
    if (scope !== undefined) scopes.add(scope);
  }
  return {
    resource: oauth.resource,
    authorization_servers: [...oauth.authorizationServers],
    bearer_methods_supported: ['header'],
    scopes_supported: [...scopes].sort(),
    ...(oauth.resourceName === undefined ? {} : { resource_name: oauth.resourceName })
  };
}

/** Where a resource's metadata is: the well-known path, then the resource's own path, on its origin. */
export function protectedResourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.origin}${PROTECTED_RESOURCE_PATH}${path}`;
}

/** A surface as a grant sees it: only the tools and resources it may use. A call outside them is the handler's to refuse. */
export function grantedSurface(surface: AgentSurfaceLike, grant: AgentGrant): AgentSurfaceLike {
  if (grant.scopes.includes('*')) return surface;
  return {
    ...surface,
    tools: async () => (await surface.tools()).filter(tool => grantAllows(grant, scopeOf(tool))),
    resources: async () => (await surface.resources()).filter(resource => grantAllows(grant, scopeOf(resource))),
    read: async uri => {
      const resource = (await surface.resources()).find(each => each.uri === uri);
      return resource === undefined || !grantAllows(grant, scopeOf(resource)) ? undefined : surface.read(uri);
    },
    call: (name, args, context) => surface.call(name, args, context)
  };
}
