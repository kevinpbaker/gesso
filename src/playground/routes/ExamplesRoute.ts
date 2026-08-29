import { EXAMPLES } from '../examples/examples';
import { createElement } from '../shell/dom';
import { mountShell } from '../shell/AppShell';
import { findRoute } from '../shell/routes';

/**
 * The examples index: one card per example, each a link to the route
 * that runs it. Plain DOM, since it is a page of links about the
 * framework rather than a page rendered by it.
 */
export function mountExamplesRoute(host: HTMLElement): () => void {
  const shell = mountShell(host, { routeId: 'examples' });
  const page = createElement('div', { className: 'pg-examples' });

  const intro = createElement('div', { className: 'pg-examples-intro' });
  intro.append(
    createElement('h1', { className: 'pg-examples-heading', text: 'Examples' }),
    createElement('p', {
      className: 'pg-examples-lede',
      text:
        'Small, complete apps that each show one way of building with Nodal. Every one runs in the render worker; ' +
        'the source file named on the card is the whole UI.'
    })
  );

  const list = createElement('div', { className: 'pg-example-list' });
  for (const example of EXAMPLES) {
    if (import.meta.env.DEV && findRoute(example.route) === undefined) {
      throw new Error(`Example '${example.title}' links to an undeclared route '${example.route}'.`);
    }
    const card = createElement('a', { className: 'pg-example-card', attrs: { href: `#${example.route}` } });
    const tags = createElement('div', { className: 'pg-example-tags' });
    for (const tag of example.tags) {
      tags.appendChild(createElement('span', { className: 'pg-example-tag', text: tag }));
    }
    card.append(
      createElement('div', { className: 'pg-example-title', text: example.title }),
      createElement('p', { className: 'pg-example-description', text: example.description }),
      tags,
      createElement('code', { className: 'pg-example-source', text: example.source })
    );
    list.appendChild(card);
  }

  page.append(intro, list);
  shell.preview.appendChild(page);
  shell.setStatus(`${EXAMPLES.length} example${EXAMPLES.length === 1 ? '' : 's'}. Click a card to run it.`);

  return () => {
    shell.dispose();
  };
}
