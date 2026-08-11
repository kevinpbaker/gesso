import { WebGPUError } from './WebGPUError';

export interface WebGPUDeviceInit {
  adapter: GPUAdapter;
  device: GPUDevice;
  format: GPUTextureFormat;
}

/**
 * Acquires a WebGPU adapter and device.
 *
 * Fails cleanly with descriptive errors when navigator.gpu, the
 * adapter, or the device request is unavailable. The returned device
 * has a loss listener attached; callers should check `isDeviceLost`
 * or subscribe via `onDeviceLost` before rendering.
 */
export async function initializeWebGPU(): Promise<WebGPUDeviceInit> {
  if (typeof navigator === 'undefined' || navigator.gpu === undefined) {
    throw new WebGPUError('navigator.gpu is not present.', 'unavailable');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    throw new WebGPUError('No WebGPU adapter found.', 'adapter');
  }

  const device = await adapter.requestDevice();
  device.lost.then(info => {
    onDeviceLostListeners.forEach(fn => fn(info));
  });

  const format = navigator.gpu.getPreferredCanvasFormat();
  return { adapter, device, format };
}

const onDeviceLostListeners = new Set<(info: GPUDeviceLostInfo) => void>();

/**
 * Subscribes to device loss events from any device created through
 * `initializeWebGPU`. Used by the renderer to enter a controlled
 * lost state.
 */
export function onDeviceLost(listener: (info: GPUDeviceLostInfo) => void): () => void {
  onDeviceLostListeners.add(listener);
  return () => {
    onDeviceLostListeners.delete(listener);
  };
}
