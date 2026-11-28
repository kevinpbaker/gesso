/**
 * The application worker's half of signing in: OAuth 2.0 with PKCE for a
 * public client, tokens kept on this thread, and a refresh nobody has to
 * remember to call. The recipe page is `recipes/signing-in.md`; the spec
 * beside this file runs it against a fake identity provider.
 */
import { defineChannel, internalState, type StorageAdapter } from 'gesso-framework/worker';

// #region contract
/** Who is signed in, as the view sees it. Never a token: see "What crosses". */
export interface SignedInUser {
  readonly name: string;
  readonly email: string;
}

export type SessionStatus = 'signedOut' | 'preparing' | 'exchanging' | 'signedIn' | 'failed';

export const Session = defineChannel('session', {
  view: {
    status: 'preparing' as SessionStatus,
    user: null as SignedInUser | null,
    /**
     * Ready before the click, because a popup must open while the click is fresh.
     * @hidden
     */
    signIn: null as { readonly popup: string; readonly page: string } | null,
    error: null as string | null
  },
  commands: {} as {
    /**
     * The provider sent the person back with this code and state.
     * @hidden
     */
    complete(code: string, state: string): void;
    /**
     * Signs the person out of this app.
     * @hidden
     */
    signOut(): void;
  }
});
// #endregion contract

// #region pkce
/** 32 random bytes as base64url: the PKCE verifier and the state are both one of these. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

/** The S256 challenge for a verifier, as RFC 7636 section 4.2 defines it. */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}
// #endregion pkce

export interface OAuthConfig {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly clientId: string;
  /** Where the popup lands: a small static page, `/auth/popup.html`. */
  readonly popupRedirectUri: string;
  /** Where a full-page redirect lands: a route of the app, `/auth/callback`. */
  readonly pageRedirectUri: string;
  readonly scope: string;
  /** Keeps the pending sign-in across a full-page redirect, and the refresh token if `remember`. */
  readonly storage: StorageAdapter;
  /** Keeps the refresh token in `storage`, so a reload stays signed in. See "Where the tokens live". */
  readonly remember: boolean;
  /** Reads the person from the access token's answer. */
  readonly profile: (accessToken: string) => Promise<SignedInUser>;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

interface Tokens {
  readonly access: string;
  readonly refresh: string | null;
  /** When the access token stops working, in ms since the epoch. */
  readonly expiresAt: number;
}

interface Pending {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: { readonly popup: string; readonly page: string };
}

const PENDING = 'auth:pending';
const REFRESH = 'auth:refresh';
/** Refresh this long before the access token expires, so a request never carries one that just did. */
const EARLY_MS = 60_000;

// #region client
export class OAuthClient {
  readonly status = internalState<SessionStatus>('preparing');
  readonly user = internalState<SignedInUser | null>(null);
  readonly signIn = internalState<{ readonly popup: string; readonly page: string } | null>(null);
  readonly error = internalState<string | null>(null);

  private tokens: Tokens | null = null;
  /** The refresh in the air, shared by everyone who needs a token while it runs. */
  private refreshing: Promise<string | null> | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: OAuthConfig) {
    this.fetch = config.fetch ?? ((input, init) => fetch(input, init));
    this.now = config.now ?? Date.now;
  }

  /** Restores a remembered session, or prepares a sign-in. Call once, at start. */
  async start(): Promise<void> {
    const stored = this.config.remember ? await this.config.storage.read(REFRESH) : null;
    if (stored !== null && stored.value !== null) {
      this.tokens = { access: '', refresh: stored.value, expiresAt: 0 };
      // A refresh that fails signs out, which prepares a sign-in.
      await this.accessToken();
      return;
    }
    await this.prepare();
  }

  /**
   * Makes the two sign-in urls and keeps what the answer will be checked
   * against. Both urls carry the same state and challenge; only where
   * the provider sends the person back differs.
   */
  async prepare(): Promise<void> {
    const pending: Pending = {
      state: randomToken(),
      verifier: randomToken(),
      redirectUri: { popup: this.config.popupRedirectUri, page: this.config.pageRedirectUri }
    };
    await this.config.storage.write(PENDING, JSON.stringify(pending));
    const challenge = await challengeOf(pending.verifier);
    const url = (redirectUri: string): string => {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: this.config.clientId,
        redirect_uri: redirectUri,
        scope: this.config.scope,
        state: pending.state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      });
      return `${this.config.authorizeUrl}?${query.toString()}`;
    };
    this.signIn.value = { popup: url(pending.redirectUri.popup), page: url(pending.redirectUri.page) };
    // A failure stays on screen, with the urls ready for another try.
    if (this.status.value !== 'failed') {
      this.status.value = 'signedOut';
    }
  }

  /** The provider sent the person back. Checks the state, then trades the code for tokens. */
  async complete(code: string, state: string, via: 'popup' | 'page'): Promise<void> {
    const read = await this.config.storage.read(PENDING);
    const pending = read.value === null ? null : (JSON.parse(read.value) as Pending);
    // One use only, whatever happens next.
    await this.config.storage.remove(PENDING);
    if (pending === null || pending.state !== state) {
      // Not the sign-in this app started: a stale tab, or a forged link.
      await this.fail('The sign-in could not be matched to this app. Try again.');
      return;
    }
    this.status.value = 'exchanging';
    const answer = await this.token({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: via === 'popup' ? pending.redirectUri.popup : pending.redirectUri.page,
      client_id: this.config.clientId
    });
    if (answer === null) {
      await this.fail('The sign-in did not finish. Try again.');
      return;
    }
    await this.signedIn(answer);
  }

  /**
   * A token that works now: the one held, or a fresh one. Concurrent
   * callers during a refresh share it, so a burst of requests costs one
   * refresh, and a refresh token that rotates is used once.
   */
  async accessToken(): Promise<string | null> {
    const tokens = this.tokens;
    if (tokens === null) {
      return null;
    }
    if (tokens.access !== '' && this.now() < tokens.expiresAt - EARLY_MS) {
      return tokens.access;
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** `fetch` with the token, and one retry after a refresh if the server says it expired. */
  async authorizedFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string | null): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (token !== null) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return this.fetch(input, { ...init, headers });
    };
    const first = await send(await this.accessToken());
    if (first.status !== 401 || this.tokens === null) {
      return first;
    }
    // The server is the authority on expiry: a clock can be wrong.
    this.tokens = { ...this.tokens, access: '', expiresAt: 0 };
    return send(await this.accessToken());
  }

  async signOut(): Promise<void> {
    this.tokens = null;
    this.status.value = 'preparing';
    this.user.value = null;
    await this.config.storage.remove(REFRESH);
    await this.prepare();
  }

  private async refresh(): Promise<string | null> {
    const refresh = this.tokens?.refresh ?? null;
    if (refresh === null) {
      await this.signOut();
      return null;
    }
    const answer = await this.token({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: this.config.clientId
    });
    if (answer === null) {
      // Revoked or expired: the person signs in again.
      await this.signOut();
      return null;
    }
    await this.signedIn(answer);
    return answer.access;
  }

  private async signedIn(tokens: Tokens): Promise<void> {
    this.tokens = tokens;
    if (this.config.remember && tokens.refresh !== null) {
      await this.config.storage.write(REFRESH, tokens.refresh);
    }
    this.user.value = await this.config.profile(tokens.access);
    this.signIn.value = null;
    this.error.value = null;
    this.status.value = 'signedIn';
  }

  private async token(body: Record<string, string>): Promise<Tokens | null> {
    try {
      const response = await this.fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      });
      if (!response.ok) {
        return null;
      }
      const json = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
      return {
        access: json.access_token,
        // A provider that rotates sends a new one; one that does not, none.
        refresh: json.refresh_token ?? this.tokens?.refresh ?? null,
        expiresAt: this.now() + json.expires_in * 1000
      };
    } catch {
      return null;
    }
  }

  private async fail(message: string): Promise<void> {
    this.error.value = message;
    this.status.value = 'failed';
    await this.prepare();
  }
}
// #endregion client

// #region popup
/**
 * Listens for the popup's answer. The popup's page posts it on a
 * BroadcastChannel, which a worker can listen on, so the code goes from
 * the popup to this thread without passing the main thread at all.
 */
export function listenForPopup(
  client: OAuthClient,
  channel: BroadcastChannel = new BroadcastChannel('auth')
): () => void {
  channel.onmessage = (event: MessageEvent<{ code?: string; state?: string }>) => {
    const { code, state } = event.data;
    if (typeof code === 'string' && typeof state === 'string') {
      void client.complete(code, state, 'popup');
    }
  };
  return () => channel.close();
}
// #endregion popup

// #region serve
export function sessionSource(client: OAuthClient) {
  return {
    view: { status: client.status, user: client.user, signIn: client.signIn, error: client.error },
    commands: {
      complete: (code: string, state: string) => void client.complete(code, state, 'page'),
      signOut: () => void client.signOut()
    }
  };
}
// #endregion serve
