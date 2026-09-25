/** The render worker the shell names, and the only side that draws. */
import { Text } from 'gesso-core';
import { renderRoot } from 'gesso-framework';

renderRoot(() => Text({ text: 'probe' }));
