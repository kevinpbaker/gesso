import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { PresenceStage } from './PresenceExample';

/** The render worker behind `<LiveExample id="presence" />`. */
renderRoot(exampleRoot(createComponent(PresenceStage, {})));
