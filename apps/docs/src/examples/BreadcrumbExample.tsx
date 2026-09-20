import { percent } from 'gesso-core';
import { Breadcrumb, Button, type BreadcrumbItem } from 'gesso-components';
import { computed, internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region breadcrumb
/** Where the page below starts out: five deep, root first. */
const START: readonly BreadcrumbItem[] = [
  { value: 'home', label: 'Home' },
  { value: 'projects', label: 'Projects' },
  { value: 'gesso', label: 'Gesso' },
  { value: 'components', label: 'Components' },
  { value: 'breadcrumb', label: 'Breadcrumb' }
];

/** A path in a repository, long enough that it has to fold. */
const PATH: readonly BreadcrumbItem[] = [
  { value: 'repo', label: 'gesso' },
  { value: 'packages', label: 'packages' },
  { value: 'package', label: 'components' },
  { value: 'src', label: 'src' },
  { value: 'file', label: 'Breadcrumb.ts' }
];

/**
 * Two trails: one you can walk back up, and one too long to draw.
 *
 * The first is the whole rule in use. Every crumb but the last is a
 * link, and following one cuts the trail back to it, so the page you
 * land on is the page the crumb named. The last crumb is where you
 * already are: it is not a link, it is not a tab stop, and it never
 * reaches `onSelect`, which is why "Breadcrumb" cannot be pressed
 * until "Go deeper" has put something after it. Tab through this
 * example and count the stops: there is one fewer than there are
 * crumbs.
 *
 * The second is the same component with `maxItems`, on a path five
 * segments deep. It keeps the root and the file and folds the three
 * between them into one crumb, which is a button named for what it
 * hides rather than three full stops a screen reader would read out.
 * Pressing it unfolds the path in place and puts the keyboard on the
 * first crumb it revealed.
 *
 * Neither names a colour, and neither says which crumb is current with
 * one: the crumb you are on is set in the same token at a heavier
 * weight, so it is distinct to someone who cannot tell the two tokens
 * apart.
 */
export function Trail(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const trail = internalState<readonly BreadcrumbItem[]>(START);
  const opened = internalState('');

  /** Following a crumb cuts the trail back to it. */
  const follow = (value: string) => {
    const at = trail.value.findIndex(item => item.value === value);
    if (at !== -1) {
      trail.value = trail.value.slice(0, at + 1);
    }
  };

  const deeper = () => {
    const next = START[trail.value.length];
    trail.value = next === undefined ? trail.value : [...trail.value, next];
  };

  return (
    <column gap={18} padding={20} width={percent(100)} height={percent(100)} y="center">
      <column gap={6}>
        <Breadcrumb items={trail} onSelect={follow} label="Where you are" />
        <text
          text={computed(() => `You are on ${trail.value[trail.value.length - 1]?.label ?? 'nothing'}.`)}
          color="textMuted"
        />
      </column>
      <row gap={8} y="center">
        <Button label="Go deeper" size="small" onClick={deeper} />
        <Button label="Start over" variant="outlined" size="small" onClick={() => (trail.value = START)} />
      </row>
      <column gap={6}>
        <Breadcrumb
          items={PATH}
          maxItems={4}
          separator="/"
          label="Repository path"
          onSelect={value => (opened.value = value)}
        />
        <text
          text={computed(() => (opened.value === '' ? 'Nothing opened yet.' : `Opened ${opened.value}.`))}
          color="textMuted"
        />
      </column>
    </column>
  );
}
// #endregion breadcrumb
