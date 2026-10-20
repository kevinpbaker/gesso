import type { WorkbenchFixture } from '../fixture';
import { accordionFixture } from './accordion';
import { alertFixture } from './alert';
import { avatarFixture } from './avatar';
import { badgeFixture } from './badge';
import { breadcrumbFixture } from './breadcrumb';
import { buttonFixture } from './button';
import { cardFixture } from './card';
import { checkboxFixture } from './checkbox';
import { chipFixture } from './chip';
import { colorPaletteFixture } from './color-palette';
import { colorPickerFixture } from './color-picker';
import { comboboxFixture } from './combobox';
import { dataTableFixture } from './data-table';
import { datePickerFixture } from './date-picker';
import { dialogFixture } from './dialog';
import { dividerFixture } from './divider';
import { findBarFixture } from './find-bar';
import { iconFixture } from './icon';
import { imageFixture } from './image';
import { lazyListFixture } from './lazy-list';
import { linkFixture } from './link';
import { menuFixture } from './menu';
import { menuBarFixture } from './menu-bar';
import { meterFixture } from './meter';
import { numberInputFixture } from './number-input';
import { paginationFixture } from './pagination';
import { plainViewFixture } from './plain-view';
import { progressBarFixture } from './progress-bar';
import { radioGroupFixture } from './radio-group';
import { segmentedControlFixture } from './segmented-control';
import { selectFixture } from './select';
import { skeletonFixture } from './skeleton';
import { sliderFixture } from './slider';
import { spinnerFixture } from './spinner';
import { splitPaneFixture } from './split-pane';
import { switchFixture } from './switch';
import { tabsFixture } from './tabs';
import { textInputFixture } from './text-input';
import { toastFixture } from './toast';
import { toolbarFixture } from './toolbar';
import { tooltipFixture } from './tooltip';
import { treeFixture } from './tree';
import { videoFixture } from './video';
import { videoPlayerFixture } from './video-player';

/** Every component the workbench shows, in the order of its rail. */
export const FIXTURES: readonly WorkbenchFixture[] = [
  buttonFixture,
  checkboxFixture,
  switchFixture,
  radioGroupFixture,
  textInputFixture,
  numberInputFixture,
  sliderFixture,
  segmentedControlFixture,
  selectFixture,
  comboboxFixture,
  datePickerFixture,
  alertFixture,
  badgeFixture,
  avatarFixture,
  chipFixture,
  meterFixture,
  progressBarFixture,
  spinnerFixture,
  skeletonFixture,
  iconFixture,
  imageFixture,
  linkFixture,
  breadcrumbFixture,
  paginationFixture,
  dividerFixture,
  cardFixture,
  dataTableFixture,
  treeFixture,
  lazyListFixture,
  plainViewFixture,
  colorPaletteFixture,
  colorPickerFixture,
  videoFixture,
  videoPlayerFixture,
  tabsFixture,
  accordionFixture,
  toolbarFixture,
  splitPaneFixture,
  dialogFixture,
  menuFixture,
  menuBarFixture,
  tooltipFixture,
  toastFixture,
  findBarFixture
];
