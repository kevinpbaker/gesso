import { createComponent, renderRoot } from 'gesso-framework';
import { LoadingList } from './SkeletonExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="skeleton" />`. */
renderRoot(exampleRoot(createComponent(LoadingList, {})));
