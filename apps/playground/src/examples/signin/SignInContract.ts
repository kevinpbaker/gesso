import { channel } from '@gesso/framework';
import type { AuthView } from '../SignInExampleApp';

/**
 * The sign-in barrier.
 *
 * One view key, because the whole screen is six scalars — §3.2's rule
 * about splitting keys is about the cost of diffing large values, and
 * there is nothing large here.
 */
export interface SignInCommands {
  press(digit: string): void;
  backspace(): void;
  toggleRemember(): void;
  signOut(): void;
}

export const SignIn = channel<{ view: AuthView }, SignInCommands>('sign-in', {
  view: {
    status: 'idle',
    entered: 0,
    attemptsLeft: 3,
    lockSecondsLeft: 0,
    rememberDevice: true,
    signedInAt: null
  }
});
