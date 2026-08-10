export enum DirtyFlags {
  None = 0,
  Content = 1 << 0,
  Paint = 1 << 1,
  Layout = 1 << 2,
  SubtreeLayout = 1 << 3,
  Children = 1 << 4,
  Transform = 1 << 5
}
