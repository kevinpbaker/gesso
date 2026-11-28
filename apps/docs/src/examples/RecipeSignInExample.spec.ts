import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createChannelRegistry, createComponent, RouterService, ServiceRegistry, ShellService } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { Session, type SessionStatus, type SignedInUser } from './RecipeSignInAuth';
import { AuthCallback, SignInButton } from './RecipeSignInExample';

/** The session channel served by a stand-in for the application worker. */
function sessionStandIn(urls: { popup: string; page: string } | null) {
  const completed: [string, string][] = [];
  const source = {
    view: {
      status: new BehaviorSubject<SessionStatus>('signedOut'),
      user: new BehaviorSubject<SignedInUser | null>(null),
      signIn: new BehaviorSubject(urls),
      error: new BehaviorSubject<string | null>(null)
    },
    commands: {
      complete: (code: string, state: string) => void completed.push([code, state]),
      signOut: () => {}
    }
  };
  return { source, completed };
}

function mount(component: Parameters<typeof createComponent>[0], urls: { popup: string; page: string } | null) {
  const services = new ServiceRegistry();
  const shell = services.register(ShellService);
  const router = services.register(RouterService);
  const { source, completed } = sessionStandIn(urls);
  const channels = createChannelRegistry([{ token: Session, source }]);
  const ui = renderTest(createComponent(component, {}), {
    width: 320,
    height: 120,
    services,
    channels: channels.registry
  });
  return { ui, shell, router, completed, dispose: () => channels.dispose() };
}

const URLS = {
  popup: 'https://id.example.com/authorize?redirect_uri=popup',
  page: 'https://id.example.com/authorize?redirect_uri=page'
};

describe('the sign-in recipe’s screens', () => {
  it('opens the popup url, and redirects the page when the popup is blocked', async () => {
    const { ui, shell, dispose } = mount(SignInButton, URLS);
    const popup = vi.spyOn(shell, 'openPopup').mockResolvedValue(false);
    const redirect = vi.spyOn(shell, 'redirect').mockImplementation(() => {});
    // Disabled until the sign-in urls arrive from the data layer.
    await vi.waitFor(() => {
      ui.frame();
      expect(ui.getByRole('button', { name: 'Sign in' })).toHaveSemantics({ disabled: false });
    });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(redirect).toHaveBeenCalled());

    expect(popup).toHaveBeenCalledWith(expect.objectContaining({ url: URLS.popup }));
    expect(redirect).toHaveBeenCalledWith(URLS.page);
    dispose();
  });

  it('does not redirect when the popup opened', async () => {
    const { ui, shell, dispose } = mount(SignInButton, URLS);
    const popup = vi.spyOn(shell, 'openPopup').mockResolvedValue(true);
    const redirect = vi.spyOn(shell, 'redirect').mockImplementation(() => {});
    // Disabled until the sign-in urls arrive from the data layer.
    await vi.waitFor(() => {
      ui.frame();
      expect(ui.getByRole('button', { name: 'Sign in' })).toHaveSemantics({ disabled: false });
    });

    ui.fireEvent.click(ui.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(popup).toHaveBeenCalled());
    await Promise.resolve();

    expect(redirect).not.toHaveBeenCalled();
    dispose();
  });

  it('hands the code to the data layer and takes it out of the address bar', async () => {
    const services = new ServiceRegistry();
    services.register(ShellService);
    const router = services.register(RouterService);
    router.match.value = { query: { code: 'abc', state: 'xyz' } } as unknown as typeof router.match.value;
    const navigate = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const { source, completed } = sessionStandIn(null);
    const channels = createChannelRegistry([{ token: Session, source }]);
    const ui = renderTest(createComponent(AuthCallback, {}), {
      width: 320,
      height: 120,
      services,
      channels: channels.registry
    });

    await vi.waitFor(() => expect(completed).toEqual([['abc', 'xyz']]));
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    expect(ui.getByText('Signing you in…')).toBeDefined();
    channels.dispose();
  });
});
