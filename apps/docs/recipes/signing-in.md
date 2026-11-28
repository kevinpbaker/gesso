---
description: 'Signing in: OAuth with PKCE through a popup or a full-page redirect, tokens kept and refreshed in the application worker, and a password form as a DOM island.'
---

# Signing in

Signing in touches all three threads, and each part belongs to one of
them:

| Thread             | Holds                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Shell (main)       | the address bar, the popup and the redirect: `ShellService` asks for them   |
| Application worker | the PKCE secret, the tokens, the token requests, and what is remembered     |
| Render worker      | the sign-in button, the route the redirect comes back to, the password form |

This is a recipe, not a framework feature. The framework gives each
thread what it needs, and the code below puts the pieces together.
All of it is in
[`RecipeSignInAuth.ts`](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/src/examples/RecipeSignInAuth.ts)
and `RecipeSignInExample.tsx`, and the specs beside them run it
against a fake identity provider.

## Choose the shape first

| Your situation                                   | Do this                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| You have a server of your own                    | Let the server do OAuth and set an `httpOnly` session cookie. The app calls `shell.redirect('/api/auth/login')` and holds no token. |
| No server: a static app and an identity provider | OAuth 2.0 with PKCE as a public client, which is the rest of this page                                                              |
| Email and password checked by your own API       | [A password form](#a-password-form) as a DOM island, and the server sets the cookie                                                 |

A cookie that script cannot read is the safest place for a session,
because nothing that runs in the page can take it. Use the first row
when you can. The rest of the page is for when you cannot.

## The contract

<<< @/src/examples/RecipeSignInAuth.ts#contract

The view holds who is signed in and never a token. A view key is read
by more than the screen: an AI agent connected to the app reads views
([Agents and MCP](/structure/agents-and-mcp)), and the
[action log](/tooling/the-action-log) records every patch. A token
kept in a view would reach both. `@hidden` keeps the sign-in urls and
both commands away from agents too, so an agent cannot sign the person
in or out.

## PKCE, in the worker

<<< @/src/examples/RecipeSignInAuth.ts#pkce

`crypto.getRandomValues` and `crypto.subtle` exist in a dedicated
worker, so the verifier is made, kept and sent on the thread that owns
the tokens. Only the challenge, which is a hash, ever reaches the
screen, inside the sign-in url.

## Ready before the click

A browser opens a popup only while the click that asked for it is
still fresh. Hashing a verifier is a promise, so an app that starts
building the url on the click has already waited too long.
`OAuthClient.prepare` makes both urls at start and after every
sign-out or failure, and publishes them. The click then only reads
them:

<<< @/src/examples/RecipeSignInExample.tsx#button

`openPopup` is the one shell request with an answer, because a blocked
popup is a dead end the app has to route around. When the answer is
no, the page itself goes to the provider with `redirect`.

Both urls carry the same `state` and challenge and differ only in
where the provider sends the person back. Register both redirect urls
with the provider.

## Coming back through the popup

The popup lands on a small static page. It hands the answer to the
app and closes:

```html
<!-- public/auth/popup.html -->
<!doctype html>
<meta charset="utf-8" />
<script>
  const query = new URLSearchParams(location.search);
  const channel = new BroadcastChannel('auth');
  channel.postMessage({ code: query.get('code'), state: query.get('state') });
  channel.close();
  window.close();
</script>
```

A `BroadcastChannel` reaches every same-origin context, a worker
included, so the application worker listens itself. The code goes
from the popup to the thread that exchanges it and never passes the
main thread:

<<< @/src/examples/RecipeSignInAuth.ts#popup

If your content security policy refuses inline scripts, put the script
in a file next to the page.

## Coming back to the page

A full-page redirect unloads the app, so the pending sign-in has to
survive a reload. `prepare` writes the state and the verifier to the
`StorageAdapter` it was given, and `complete` reads them, uses them
once and removes them.

The provider sends the person back to a route of the app:

```ts
export const Callback = route({ path: '/auth/callback', component: AuthCallback });
```

<<< @/src/examples/RecipeSignInExample.tsx#callback

The route replaces the history entry at once, so the code is not left
in the address bar, the history or a bookmark.

## The exchange, the tokens and the refresh

<<< @/src/examples/RecipeSignInAuth.ts#client

What it does, and why:

- **The state is checked before anything is sent.** An answer the app
  did not start (a stale tab, a forged link) is refused, and a
  pending sign-in is used once, so the same answer twice is refused
  too.
- **A refresh is shared.** Every caller that needs a token while a
  refresh runs waits for that one refresh. A burst of requests costs
  one, and a provider that rotates refresh tokens sees each one used
  once.
- **It refreshes early,** a minute before the token expires, so a
  request never leaves with a token that is about to stop working.
- **A 401 gets one retry** after a refresh. The server decides when a
  token has expired, and the device's clock can be wrong.
- **A refresh that fails signs the person out** and prepares a new
  sign-in, so the screen always has a way forward.

It is served like any other source:

<<< @/src/examples/RecipeSignInAuth.ts#serve

```ts
// app.worker.ts
const auth = new OAuthClient({ /* … */ storage: new IndexedDbStorage(), remember: true });
listenForPopup(auth);
void auth.start();
serveChannels([{ token: Session, source: sessionSource(auth) }]);
```

## Where the tokens live

| `remember` | Access token  | Refresh token        | After a reload  |
| ---------- | ------------- | -------------------- | --------------- |
| `false`    | worker memory | worker memory        | signs in again  |
| `true`     | worker memory | the `StorageAdapter` | stays signed in |

The access token is never stored. Remembering the refresh token keeps
the person signed in across reloads, and the cost is that any script
running on the page can read IndexedDB. A Gesso screen has no HTML to
inject script into, but a compromised dependency is still script on
the page. If that risk is too high, set `remember: false`, ask the
provider for short-lived, rotating refresh tokens, or use the server
cookie from the first table.

## Using the token

Everything that talks to your API goes through `authorizedFetch`, on
the application worker. A shared document from
[`gesso-sync`](/structure/collaboration) asks for a fresh token on
each connection:

```ts
websocketTransport({
  url: 'wss://sync.example.com',
  room: 'board-42',
  params: async () => ({ token: (await auth.accessToken()) ?? '' })
});
```

## Signing out

`signOut` forgets the tokens and the stored refresh token, and
prepares a new sign-in. What else the person leaves behind is the
app's to clear:

- the [undo stack](/structure/undo#what-does-not-belong-on-the-stack):
  `undo.clear()`, because its entries name another person's data;
- anything [`persisted`](/structure/persistence) under a key that is
  not per user;
- the provider's own session, if the person expects to be signed out
  there too: `shell.redirect` to the provider's end-session url.

## A password form

When your own API checks an email and a password, the fields must be
real `<input>` elements, so that a password manager fills them and
offers to save the password. They are
[DOM islands](/guide/dom-islands#a-native-field):

```tsx
<NativeInput form="sign-in" name="email" type="email" autocomplete="username"
             label="Email" value={email} onChange={value => (email.value = value)} />
<NativeInput form="sign-in" name="password" type="password" autocomplete="current-password"
             label="Password" value={password} onChange={value => (password.value = value)}
             onSubmit={signIn} />
```

`email` and `password` are cells on the render worker, not view keys,
so the password is never in a view, the action log or an agent's
reach. `signIn` submits the form, so the password manager sees a
sign-in, and sends the two values once, in a command marked
`@hidden`. The application worker posts them to your API, and the
API answers with an `httpOnly` cookie, so no token reaches the app at
all.

## What this was checked against

The specs beside the example run in node against a fake identity
provider. They check the PKCE challenge against the worked example in
RFC 7636, the state check, single use, a shared refresh, the retry
after a 401, remembering and forgetting, and that no token is in the
view. The screens' specs check the popup, the fallback to a redirect,
and the callback route. Nothing here has been run against a real
identity provider, or with a real popup in a browser.
