import { MemoryStorage } from 'gesso-framework/worker';
import { describe, expect, it } from 'vitest';

import { challengeOf, OAuthClient, randomToken, sessionSource, type OAuthConfig } from './RecipeSignInAuth';

/** An identity provider in a function: it issues codes, checks PKCE, and rotates refresh tokens. */
function fakeProvider() {
  const challenges = new Map<string, string>();
  const live = new Set<string>();
  let issued = 0;
  let refused = '';
  const calls: Record<string, string>[] = [];

  const issue = () => {
    issued++;
    const refresh = `refresh-${issued}`;
    live.add(refresh);
    return { access_token: `access-${issued}`, refresh_token: refresh, expires_in: 3600 };
  };

  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://id.example.com/token') {
      const body = Object.fromEntries(new URLSearchParams(String(init?.body)));
      calls.push(body);
      if (body.grant_type === 'authorization_code') {
        const expected = challenges.get(body.code!);
        const ok = expected !== undefined && expected === (await challengeOf(body.code_verifier!));
        return ok ? Response.json(issue()) : new Response('bad verifier', { status: 400 });
      }
      if (body.grant_type === 'refresh_token' && live.delete(body.refresh_token!)) {
        return Response.json(issue());
      }
      return new Response('invalid_grant', { status: 400 });
    }
    if (url === 'https://api.example.com/orders') {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === `Bearer access-${issued}` && auth !== `Bearer ${refused}`
        ? Response.json([])
        : new Response('expired', { status: 401 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;

  /** What the provider does when the person approves: a code bound to the challenge in the url. */
  const approve = (authorizeUrl: string): { code: string; state: string } => {
    const query = new URL(authorizeUrl).searchParams;
    const code = `code-${challenges.size + 1}`;
    challenges.set(code, query.get('code_challenge')!);
    return { code, state: query.get('state')! };
  };

  return {
    fetch,
    approve,
    calls,
    revokeAll: () => live.clear(),
    /** The server stops taking the current access token before the app's clock says it expired. */
    expireAccess: () => (refused = `access-${issued}`)
  };
}

function client(overrides: Partial<OAuthConfig> = {}) {
  const provider = fakeProvider();
  let now = 1_000_000;
  const storage = new MemoryStorage();
  const made = new OAuthClient({
    authorizeUrl: 'https://id.example.com/authorize',
    tokenUrl: 'https://id.example.com/token',
    clientId: 'gesso-app',
    popupRedirectUri: 'https://app.example.com/auth/popup.html',
    pageRedirectUri: 'https://app.example.com/auth/callback',
    scope: 'openid profile email',
    storage,
    remember: true,
    profile: async () => ({ name: 'Ada', email: 'ada@example.com' }),
    fetch: provider.fetch,
    now: () => now,
    ...overrides
  });
  return { client: made, provider, storage, advance: (ms: number) => (now += ms) };
}

describe('the sign-in recipe', () => {
  it('makes a PKCE challenge as RFC 7636 says', async () => {
    // The worked example in RFC 7636, appendix B.
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it('has both sign-in urls ready before anyone clicks', async () => {
    const { client: auth } = client();
    await auth.start();

    const urls = auth.signIn.value!;
    const popup = new URL(urls.popup).searchParams;
    const page = new URL(urls.page).searchParams;
    expect(auth.status.value).toBe('signedOut');
    expect(popup.get('code_challenge_method')).toBe('S256');
    expect(popup.get('redirect_uri')).toBe('https://app.example.com/auth/popup.html');
    expect(page.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
    expect(page.get('state')).toBe(popup.get('state'));
  });

  it('signs in through the popup, sending the verifier, and the view never holds a token', async () => {
    const { client: auth, provider } = client();
    await auth.start();
    const { code, state } = provider.approve(auth.signIn.value!.popup);

    await auth.complete(code, state, 'popup');

    expect(auth.status.value).toBe('signedIn');
    expect(auth.user.value).toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect(provider.calls[0]!.redirect_uri).toBe('https://app.example.com/auth/popup.html');
    const view = sessionSource(auth).view;
    const everything = JSON.stringify(Object.values(view).map(cell => cell.value));
    expect(everything).not.toContain('access-');
    expect(everything).not.toContain('refresh-');
  });

  it('refuses an answer whose state is not the one it sent, with the urls ready for another try', async () => {
    const { client: auth, provider } = client();
    await auth.start();
    const { code } = provider.approve(auth.signIn.value!.page);

    await auth.complete(code, 'forged', 'page');

    expect(auth.status.value).toBe('failed');
    expect(auth.error.value).toBe('The sign-in could not be matched to this app. Try again.');
    expect(auth.signIn.value).not.toBeNull();
    expect(provider.calls).toEqual([]);
  });

  it('uses a sign-in once: the same answer twice is refused', async () => {
    const { client: auth, provider } = client();
    await auth.start();
    const { code, state } = provider.approve(auth.signIn.value!.page);
    await auth.complete(code, state, 'page');
    await auth.signOut();

    await auth.complete(code, state, 'page');

    expect(auth.status.value).toBe('failed');
    expect(provider.calls.filter(call => call.grant_type === 'authorization_code')).toHaveLength(1);
  });

  it('refreshes once for a burst of callers, before the token expires', async () => {
    const { client: auth, provider, advance } = client();
    await auth.start();
    const { code, state } = provider.approve(auth.signIn.value!.page);
    await auth.complete(code, state, 'page');
    expect(await auth.accessToken()).toBe('access-1');

    advance(3600_000 - 30_000);
    const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);

    expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    expect(provider.calls.filter(call => call.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('retries a request once after a 401, with a fresh token', async () => {
    const { client: auth, provider } = client();
    await auth.start();
    const { code, state } = provider.approve(auth.signIn.value!.page);
    await auth.complete(code, state, 'page');
    provider.expireAccess();

    const response = await auth.authorizedFetch('https://api.example.com/orders');

    expect(response.status).toBe(200);
    expect(provider.calls.filter(call => call.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('stays signed in across a reload when it remembers, and signs out when the refresh is revoked', async () => {
    const first = client();
    await first.client.start();
    const { code, state } = first.provider.approve(first.client.signIn.value!.page);
    await first.client.complete(code, state, 'page');

    const reloaded = new OAuthClient({
      authorizeUrl: 'https://id.example.com/authorize',
      tokenUrl: 'https://id.example.com/token',
      clientId: 'gesso-app',
      popupRedirectUri: 'https://app.example.com/auth/popup.html',
      pageRedirectUri: 'https://app.example.com/auth/callback',
      scope: 'openid',
      storage: first.storage,
      remember: true,
      profile: async () => ({ name: 'Ada', email: 'ada@example.com' }),
      fetch: first.provider.fetch
    });
    await reloaded.start();
    expect(reloaded.status.value).toBe('signedIn');

    first.provider.revokeAll();
    await reloaded.signOut();
    expect(await first.storage.read('auth:refresh')).toMatchObject({ value: null });
  });

  it('forgets everything on sign-out when it does not remember', async () => {
    const { client: auth, provider, storage } = client({ remember: false });
    await auth.start();
    const { code, state } = provider.approve(auth.signIn.value!.page);
    await auth.complete(code, state, 'page');

    expect(await storage.keys()).toEqual([]);
    await auth.signOut();
    expect(auth.status.value).toBe('signedOut');
    expect(await auth.accessToken()).toBeNull();
  });
});
