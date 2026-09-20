import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Pulse } from './PulseExample';

/** The render-worker half of the home page's thread demonstration. */
renderRoot(exampleRoot(createComponent(Pulse, { label: 'Render worker', caption: 'In a render worker' })));
