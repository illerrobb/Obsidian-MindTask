import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';

declare global {
  interface Window {
    ResizeObserver: any;
  }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;

// Basic ResizeObserver stub
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = RO;

// Minimal DOM helper polyfills used by the plugin
const proto = dom.window.HTMLElement.prototype as any;
proto.createDiv = function(arg: any) {
  const el = dom.window.document.createElement('div');
  if (typeof arg === 'string') {
    el.className = arg;
  } else if (arg?.cls) {
    el.className = arg.cls;
  }
  if (typeof arg === 'object' && arg?.text) {
    el.textContent = arg.text;
  }
  this.appendChild(el);
  return el;
};
proto.createSpan = function(arg: any) {
  const el = dom.window.document.createElement('span');
  if (arg?.cls) el.className = arg.cls;
  if (arg?.text) el.textContent = arg.text;
  this.appendChild(el);
  return el;
};
proto.setAttr = function(name: string, value: string) {
  this.setAttribute(name, value);
};
proto.addClass = function(cls: string) { this.classList.add(cls); };
proto.removeClass = function(cls: string) { this.classList.remove(cls); };
proto.setText = function(text: string) { this.textContent = text; };

const root = document.getElementById('root')!;

// Stub view instance with minimal properties
const view: any = {
  board: {
    orientation: 'vertical',
    nodes: {
      b1: { x: 0, y: 0, type: 'board', name: 'B1', taskCount: 0 },
    },
  },
  tasks: new Map(),
  boardEl: root,
  plugin: { openBoardFile: () => {} },
  drawEdges: () => {},
  updateOverflow: () => {},
};

const nodeEl = (BoardView.prototype as any).createNodeElement.call(view, 'b1', root);

const hasIn = nodeEl.querySelector('.vtasks-handle-in');
const hasOut = nodeEl.querySelector('.vtasks-handle-out');

if (!hasIn || !hasOut) {
  throw new Error('Board node is missing connection handles');
}

console.log('Board node has in/out handles');
