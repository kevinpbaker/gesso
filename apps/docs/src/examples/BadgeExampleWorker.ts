import { createComponent, renderRoot } from '@gesso/framework';
import { Mailbox } from './BadgeExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="badge" />`. */
renderRoot(exampleRoot(createComponent(Mailbox, {})));
