import { map } from 'rxjs/operators';

import { Breadcrumb, type BreadcrumbItem, Button } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';
import type { WorkbenchFixture } from '../fixture';

function crumbs(...labels: string[]): readonly BreadcrumbItem[] {
  return labels.map(label => ({ value: label.toLowerCase().replace(/\s+/g, '-'), label }));
}

const SHORT = crumbs('Home', 'Projects', 'Gesso', 'Components');
const DEEP = crumbs(
  'Home',
  'Organisations',
  'Personal',
  'Projects',
  'Gesso',
  'Packages',
  'Components',
  'Source',
  'Breadcrumb'
);
const VERY_DEEP = crumbs(...Array.from({ length: 15 }, (_, index) => `Level ${index + 1}`));

/** A trail that reports what was pressed. */
function Reporting(inputs: Inputs<{ items: readonly BreadcrumbItem[]; maxItems?: number }>, _ctx: ComponentContext) {
  const selected = internalState('nothing yet');
  return (
    <column gap={8} x="start">
      <Breadcrumb items={inputs.items} maxItems={inputs.maxItems} onSelect={value => (selected.value = value)} />
      <text textStyle="bodySmall" color="textMuted">
        {selected.pipe(map(value => `Selected: ${value}`))}
      </text>
    </column>
  );
}

/** A trail that follows its own presses, as an application's would. */
function Navigating(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const trail = internalState<readonly BreadcrumbItem[]>(DEEP.slice(0, 3));
  const follow = (value: string) => {
    const at = trail.value.findIndex(item => item.value === value);
    if (at !== -1) {
      trail.value = trail.value.slice(0, at + 1);
    }
  };
  const deeper = () => {
    const next = DEEP[trail.value.length];
    if (next !== undefined) {
      trail.value = [...trail.value, next];
    }
  };
  return (
    <column gap={8} x="start">
      <Breadcrumb items={trail} maxItems={4} onSelect={follow} />
      <row gap={8} y="center">
        <Button label="Go deeper" size="small" onClick={deeper} />
        <text textStyle="bodySmall" color="textMuted">
          {trail.pipe(map(items => `${items.length} crumbs`))}
        </text>
      </row>
    </column>
  );
}

export const breadcrumbFixture: WorkbenchFixture = {
  id: 'breadcrumb',
  name: 'Breadcrumb',
  source: 'packages/components/src/Breadcrumb.ts',
  states: [
    {
      name: 'Default',
      try: 'Click Projects: the line says projects. Tab walks Home, Projects, Gesso with a ring on each and skips Components, which is plain text. Enter and Space both select.',
      width: 360,
      render: () => <Reporting items={SHORT} />
    },
    {
      name: 'One, two, none',
      try: 'One crumb is plain text with no separator and no tab stop. Two crumbs have one separator. The empty trail draws nothing and leaves no gap.',
      width: 320,
      render: () => (
        <column gap={10} x="start">
          <Breadcrumb items={crumbs('Home')} />
          <Breadcrumb items={crumbs('Home', 'Settings')} />
          <Breadcrumb items={[]} />
          <text textStyle="bodySmall" color="textMuted">
            (end)
          </text>
        </column>
      )
    },
    {
      name: 'Separators',
      try: 'Each separator is centred between its crumbs with equal space either side, and is not a tab stop.',
      width: 360,
      render: () => (
        <column gap={10} x="start">
          {['/', '›', '→', '·'].map(separator => (
            <Breadcrumb key={separator} items={SHORT} separator={separator} />
          ))}
        </column>
      )
    },
    {
      name: 'Collapsed',
      try: 'Nine crumbs at maxItems 4 show Home / … / Breadcrumb. Press the ellipsis (or Tab to it and press Enter): all nine appear in place and focus moves to Organisations.',
      width: 360,
      render: () => <Reporting items={DEEP} maxItems={4} />
    },
    {
      name: 'Navigating',
      try: 'Press Go deeper until it collapses, expand the ellipsis, then click Personal: the trail shortens to three. Go deeper again until it collapses: it is folded again, not still expanded.',
      width: 360,
      render: () => <Navigating />
    },
    {
      name: 'Many crumbs, no collapse',
      try: 'Fifteen crumbs in a 360 cell: note whether they wrap or run off the card. Crumbs must never overlap one another.',
      width: 360,
      render: () => <Reporting items={VERY_DEEP} />
    },
    {
      name: 'Long labels in a narrow box',
      try: 'Long crumb names in a 200 cell: each crumb stays readable and separators stay between crumbs; note anything drawn past the card edge.',
      width: 200,
      render: () => <Breadcrumb items={crumbs('Organisation settings', 'Billing and invoices', 'Invoice 2026-0042')} />
    },
    {
      name: 'maxItems too small',
      try: 'Two crumbs at maxItems 1 are left alone (no ellipsis standing for nothing); four crumbs at maxItems 2 collapse to Home / … / Components and no further.',
      width: 320,
      render: () => (
        <column gap={10} x="start">
          <Breadcrumb items={crumbs('Home', 'Settings')} maxItems={1} />
          <Breadcrumb items={SHORT} maxItems={2} />
        </column>
      )
    }
  ]
};
