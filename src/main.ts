import './style.css';
import { mountBindingDemo } from './playground/BindingDemoView';
import { mountCanvasPlayground } from './playground/CanvasPlaygroundView';
import { mountPlayground } from './playground/PlaygroundView';

type Mount = (host: HTMLElement) => () => void;

const ROUTES: Record<string, Mount> = {
  debug: mountPlayground,
  canvas: mountCanvasPlayground,
  binding: mountBindingDemo,
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
