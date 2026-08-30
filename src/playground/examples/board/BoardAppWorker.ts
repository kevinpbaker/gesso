import { serveChannels } from '../../../framework/channel/serveChannels';
import { BoardModel } from '../AnimationExampleApp';
import { Board } from './BoardContract';

/** The board application, on its own thread. */
const board = new BoardModel();

serveChannels([
  {
    token: Board,
    source: {
      view: { board: board.board },
      commands: {
        shuffle: () => board.shuffle(),
        shift: (payload: { id: string; delta: number }) => board.shift(payload),
        reorder: (payload: { id: string; delta: number }) => board.reorder(payload),
        toggleCard: (id: string) => board.toggleCard(id),
        undoMove: () => board.undoMove(),
        clearUndo: () => board.clearUndo(),
        setMotion: (motion: string) => board.setMotion(motion as never)
      }
    }
  }
]);
