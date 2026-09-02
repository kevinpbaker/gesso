import { Subject, map, merge } from 'rxjs';

import { derive, input, into, type Inputs } from '@gesso/framework';

// #region declare
interface RowInputs {
  /** Required: the parent must pass it, as a value or an Observable. */
  title: string;
  /** Optional: arrives as a cell that may hold undefined. */
  emphasis?: 'normal' | 'strong';
  /** An output: the parent passes a handler, or `into(subject)`. */
  onPick: (title: string) => void;
  /** An optional output, fired with no arguments. */
  onHover?: () => void;
}

export function Row(inputs: Inputs<RowInputs>) {
  const weight = derive([input(inputs.emphasis, 'normal')], emphasis => (emphasis === 'strong' ? 700 : 400));
  // #endregion declare
  // #region emit
  return (
    <button
      padding={8}
      onPointerEnter={() => inputs.onHover.emit()}
      onClick={() => inputs.onPick.emit(inputs.title.value)}>
      <text fontWeight={weight}>{inputs.title}</text>
    </button>
  );
  // #endregion emit
}

// #region receive
export function List() {
  const picked = new Subject<string>();
  const hovered = new Subject<void>();
  // Two outputs from many rows, merged into one stream for the parent.
  const activity = merge(picked.pipe(map(title => `picked ${title}`)), hovered.pipe(map(() => 'hovering')));
  return (
    <column gap={4}>
      {['Alpha', 'Beta', 'Gamma'].map(title => (
        <Row key={title} title={title} onPick={into(picked)} onHover={into(hovered)} />
      ))}
      <text color="textMuted">{activity}</text>
    </column>
  );
}
// #endregion receive
