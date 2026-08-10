export enum MainAxisAlignment {
  Start = 0,
  Center = 1,
  End = 2,
  SpaceBetween = 3,
  SpaceEvenly = 4,
  SpaceAround = 5
}

export enum CrossAxisAlignment {
  Start = 0,
  Center = 1,
  End = 2,
  Stretch = 3
}

export function parseMainAxisAlignment(value: unknown): MainAxisAlignment {
  if (typeof value === 'string') {
    switch (value) {
      case 'center':
        return MainAxisAlignment.Center;
      case 'end':
        return MainAxisAlignment.End;
      case 'space-between':
        return MainAxisAlignment.SpaceBetween;
      case 'space-evenly':
        return MainAxisAlignment.SpaceEvenly;
      case 'space-around':
        return MainAxisAlignment.SpaceAround;
    }
  }
  if (typeof value === 'number') {
    return value as MainAxisAlignment;
  }
  return MainAxisAlignment.Start;
}

export function parseCrossAxisAlignment(value: unknown): CrossAxisAlignment | undefined {
  if (typeof value === 'string') {
    switch (value) {
      case 'center':
        return CrossAxisAlignment.Center;
      case 'end':
        return CrossAxisAlignment.End;
      case 'stretch':
        return CrossAxisAlignment.Stretch;
    }
  }
  if (typeof value === 'number') {
    return value as CrossAxisAlignment;
  }
  return undefined;
}
