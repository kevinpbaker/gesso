export enum FlexDirection {
  Row = 0,
  Column = 1
}

export function parseFlexDirection(value: unknown): FlexDirection | undefined {
  if (value === 'row' || value === 'horizontal') {
    return FlexDirection.Row;
  }
  if (value === 'column' || value === 'vertical') {
    return FlexDirection.Column;
  }
  return undefined;
}
