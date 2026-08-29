import { renderRoot } from '../../framework/app/worker/renderRoot';
import { AuthStore, SignInApp } from './SignInExampleApp';

/**
 * Render worker for the sign-in example: the whole UI, the store and
 * its timers live here. The main thread only forwards input.
 */
renderRoot(SignInApp).useStore(AuthStore);
