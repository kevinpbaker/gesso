import { renderRoot } from '@gesso/framework';
import { SignInApp } from './SignInExampleApp';
import { SignIn } from './signin/SignInContract';

/**
 * Render worker for the sign-in example. The keypad and the screen
 * live here; the authentication lives on the application worker.
 */
renderRoot(SignInApp).useChannel(SignIn);
