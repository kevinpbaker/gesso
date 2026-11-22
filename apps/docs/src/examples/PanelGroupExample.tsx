import { map } from 'rxjs/operators';

import { percent } from 'gesso-core';
import { Button, PanelGroup } from 'gesso-components';
import { internalState, type ComponentContext, type Inputs } from 'gesso-framework';

// #region panel-group
/** A region of the layout: its name, centred, on a surface. */
function Region(inputs: Inputs<{ name: string }>, _ctx: ComponentContext) {
  return (
    <box width={percent(100)} height={percent(100)} backgroundColor="surface" x="center" y="center">
      <text text={inputs.name} color="textMuted" />
    </box>
  );
}

/**
 * An editor's layout: an explorer, the text, an outline, and a terminal
 * under the text, which is a second group inside the first.
 *
 * Drag a divider, or focus it and use the arrows (Shift for bigger
 * steps). Drag the explorer's divider most of the way left and it folds
 * away; Enter on its divider, or the button, brings it back. A double
 * click on a divider puts its panel back to where it started. Widen the
 * window and only the text grows.
 */
export function Workbench(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const sizes = internalState<Readonly<Record<string, number>>>({});
  const collapsed = internalState<readonly string[]>([]);
  const explorerShown = collapsed.pipe(map(keys => !keys.includes('explorer')));

  const toggleExplorer = () => {
    const keys = collapsed.value;
    collapsed.value = keys.includes('explorer') ? keys.filter(key => key !== 'explorer') : [...keys, 'explorer'];
  };

  return (
    <column gap={10} padding={16} width={percent(100)} height={percent(100)}>
      <Button
        label={explorerShown.pipe(map(shown => (shown ? 'Hide explorer' : 'Show explorer')))}
        variant="outlined"
        size="small"
        selfX="start"
        onClick={toggleExplorer}
      />
      <box flexGrow={1} minHeight={0} borderColor="border" borderWidth={1}>
        <PanelGroup
          sizes={sizes}
          onSizesChange={next => (sizes.value = next)}
          collapsed={collapsed}
          onCollapsedChange={next => (collapsed.value = next)}
          panels={[
            {
              key: 'explorer',
              label: 'Explorer',
              content: <Region name="Explorer" />,
              defaultSize: 160,
              collapsible: true
            },
            {
              key: 'main',
              fill: true,
              content: (
                <PanelGroup
                  direction="column"
                  panels={[
                    { key: 'text', content: <Region name="Text" />, fill: true },
                    {
                      key: 'terminal',
                      label: 'Terminal',
                      content: <Region name="Terminal" />,
                      defaultSize: 90,
                      minSize: 60,
                      collapsible: true
                    }
                  ]}
                />
              )
            },
            {
              key: 'outline',
              label: 'Outline',
              content: <Region name="Outline" />,
              defaultSize: 140,
              minSize: 100,
              maxSize: 240
            }
          ]}
        />
      </box>
    </column>
  );
}
// #endregion panel-group
