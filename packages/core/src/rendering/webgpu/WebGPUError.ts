/**
 * Base error for WebGPU renderer failures.
 *
 * Carries a `phase` tag so callers can distinguish initialization,
 * resize, shader compilation, pipeline creation, and device loss.
 */
export class WebGPUError extends Error {
  constructor(
    message: string,
    public readonly phase:
      | 'unavailable'
      | 'adapter'
      | 'device'
      | 'context'
      | 'configure'
      | 'shader'
      | 'pipeline'
      | 'render'
      | 'lost'
      | 'disposed',
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'WebGPUError';
  }
}

/**
 * Reports that the WebGPU renderer is not usable on this client.
 */
export function throwWebGPUUnavailable(reason: string): never {
  throw new WebGPUError(`WebGPU is unavailable: ${reason}`, 'unavailable');
}
