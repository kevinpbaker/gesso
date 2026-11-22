import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Workbench } from './PanelGroupExample';

/** The render worker behind `<LiveExample id="panelgroup" />`. */
renderRoot(exampleRoot(createComponent(Workbench, {})));
