import { renderRoot } from '@gesso/framework';
import { Board } from './board/BoardContract';
import { BoardApp } from './AnimationExampleApp';

/**
 * Render worker for the animation example. Every animation on the
 * board is advanced by this worker's own `ticks` phase; the main
 * thread forwards input and reports the frame timings the status bar
 * shows.
 */
renderRoot(BoardApp).useChannel(Board);
