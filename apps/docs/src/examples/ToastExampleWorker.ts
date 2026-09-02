import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Notices } from './ToastExample';

/** The render worker behind `<LiveExample id="toast" />`. */
renderRoot(exampleRoot(createComponent(Notices, {})));
