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
  Stretch = 3,
  /** Rows only: align first baselines. A column treats it as Start. */
  Baseline = 4
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
      case 'start':
        return CrossAxisAlignment.Start;
      case 'center':
        return CrossAxisAlignment.Center;
      case 'end':
        return CrossAxisAlignment.End;
      case 'stretch':
        return CrossAxisAlignment.Stretch;
      case 'baseline':
        return CrossAxisAlignment.Baseline;
    }
  }
  if (typeof value === 'number') {
    return value as CrossAxisAlignment;
  }
  return undefined;
}

/** Distribution of a multi-line flex container's lines along the cross axis. */
export enum AlignContent {
  Start = 0,
  Center = 1,
  End = 2,
  SpaceBetween = 3,
  SpaceEvenly = 4,
  SpaceAround = 5,
  Stretch = 6
}

export function parseAlignContent(value: unknown): AlignContent {
  switch (value) {
    case 'start':
      return AlignContent.Start;
    case 'center':
      return AlignContent.Center;
    case 'end':
      return AlignContent.End;
    case 'space-between':
      return AlignContent.SpaceBetween;
    case 'space-evenly':
      return AlignContent.SpaceEvenly;
    case 'space-around':
      return AlignContent.SpaceAround;
    default:
      return AlignContent.Stretch;
  }
}
