import { serveChannels } from '@gesso/framework';
import { AuthApp } from '../SignInExampleApp';
import { SignIn } from './SignInContract';

/**
 * The sign-in application, on its own thread.
 *
 * One plain class and one call. The lockout timer, the fake round trip
 * to an auth service and the attempt counting all run here, so none of
 * it can delay a frame.
 */
const auth = new AuthApp();

serveChannels([
  {
    token: SignIn,
    source: {
      view: { view: auth.view },
      commands: {
        press: (digit: string) => auth.press(digit),
        backspace: () => auth.backspace(),
        toggleRemember: () => auth.toggleRemember(),
        signOut: () => auth.signOut()
      }
    }
  }
]);
