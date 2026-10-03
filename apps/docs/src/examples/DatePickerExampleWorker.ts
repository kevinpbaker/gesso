import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Schedule } from './DatePickerExample';

/** The render worker behind `<LiveExample id="datepicker" />`. */
renderRoot(exampleRoot(createComponent(Schedule, {})));
