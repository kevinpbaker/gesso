import { channel } from '../../../framework/channel/ChannelToken';
import type { BoardView, LaneOrder } from '../AnimationExampleApp';

export interface BoardCommands {
  shuffle(): void;
  shift(payload: { id: string; delta: number }): void;
  reorder(payload: { id: string; delta: number }): void;
  toggleCard(id: string): void;
  undoMove(): void;
  clearUndo(): void;
  setMotion(motion: string): void;
}

const EMPTY: LaneOrder = { todo: [], doing: [], done: [] };

export const Board = channel<{ board: BoardView }, BoardCommands>('board', {
  board: { order: EMPTY, selected: null, undo: null, motion: 'snappy' }
});
