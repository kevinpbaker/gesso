import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { ShellSignals } from './ShellServicesExample';

/** The render worker behind `<LiveExample id="shellservices" />`. */
renderRoot(exampleRoot(createComponent(ShellSignals, {})));
