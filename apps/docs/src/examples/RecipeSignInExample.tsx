import { Button } from 'gesso-components';
import { computed, RouterService, ShellService, type ComponentContext, type Inputs } from 'gesso-framework';

import { Session } from './RecipeSignInAuth';

// #region button
/**
 * Signs in through a popup, and through a full-page redirect where the
 * browser blocks the popup. The url was made before the click, because a
 * popup asked for after slow work is refused.
 */
export function SignInButton(_inputs: Inputs<object>, ctx: ComponentContext) {
  const session = ctx.channel(Session);
  const shell = ctx.inject(ShellService);

  const signIn = async (): Promise<void> => {
    const urls = session.view.signIn.value;
    if (urls === null) {
      return;
    }
    const opened = await shell.openPopup({ url: urls.popup, name: 'sign-in', width: 480, height: 640 });
    if (!opened) {
      shell.redirect(urls.page);
    }
  };

  return (
    <Button
      label="Sign in"
      disabled={computed(() => session.view.signIn.value === null)}
      onClick={() => void signIn()}
    />
  );
}
// #endregion button

// #region callback
/**
 * The route a full-page redirect comes back to, `/auth/callback`. It
 * hands the code to the application worker and takes it out of the
 * address bar at once, so it is not in the history, a bookmark or a
 * screenshot.
 */
export function AuthCallback(_inputs: Inputs<object>, ctx: ComponentContext) {
  const session = ctx.channel(Session);
  const router = ctx.inject(RouterService);

  ctx.onMount(() => {
    const query = router.match.value?.query ?? {};
    if (query['code'] !== undefined && query['state'] !== undefined) {
      session.send.complete(query['code'], query['state']);
    }
    router.navigate('/', { replace: true });
  });

  return <text text="Signing you in…" textStyle="body" />;
}
// #endregion callback
