/**
 * "4:07", the way a track list and a seek bar write a length.
 *
 * Its own module because both threads want it: the application worker
 * formats every track's duration once for the wire, and the render
 * worker formats the moving position of the one that is playing.
 */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}
