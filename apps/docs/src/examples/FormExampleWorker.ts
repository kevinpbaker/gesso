import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Form } from './FormExample';

/** The render worker behind `<LiveExample id="form" />`. */
renderRoot(exampleRoot(createComponent(Form, {})));
