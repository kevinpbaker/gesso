import './style.css';
import { mountBindingDemo } from './playground/BindingDemoView';
import { mountCanvasPlayground } from './playground/CanvasPlaygroundView';
import { mountFrameworkPlayground } from './playground/FrameworkPlaygroundView';
import { mountPlayground } from './playground/PlaygroundView';
import { mountWebGPUPlayground } from './playground/WebGPUPlaygroundView';
import { mountWebGPUBenchmark } from './playground/WebGPUBenchmarkView';
import { mountComparison } from './playground/ComparisonView';
import { mountThemePlayground } from './playground/ThemePlaygroundView';

type Mount = (host: HTMLElement) => () => void;

const ROUTES: Record<string, Mount> = {
  debug: mountPlayground,
  canvas: mountCanvasPlayground,
  framework: mountFrameworkPlayground,
  webgpu: mountWebGPUPlayground,
  compare: mountComparison,
  benchmark: mountWebGPUBenchmark,
  binding: mountBindingDemo,
  theme: mountThemePlayground,
  nothing: mountBindingDemo
};

function mountRoute(): void {
  const host = document.querySelector<HTMLElement>('#app');
  if (host === null) {
    throw new Error("Missing '#app' element.");
  }
  const key = window.location.hash.replace('#', '') || 'debug';
  const mount = ROUTES[key] ?? mountPlayground;
  unmount?.();
  unmount = mount(host);
}

let unmount: (() => void) | null = null;
window.addEventListener('hashchange', mountRoute);
mountRoute();
