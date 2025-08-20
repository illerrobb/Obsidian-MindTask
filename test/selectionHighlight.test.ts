import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';

declare global {
  interface Window { ResizeObserver: any; }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = RO;

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

const view: any = {
  board: {
    orientation: 'vertical',
    nodes: { t1: { x: 0, y: 0 } },
  },
  tasks: new Map(),
  boardEl: root,
  selectedIds: new Set(['t1']),
  plugin: { openBoardFile: () => {} },
  drawEdges: () => {},
  updateOverflow: () => {},
};

(BoardView.prototype as any).createNodeElement.call(view, 't1', root);

const node = root.querySelector('.vtasks-node[data-id="t1"]');
if (!node?.classList.contains('selected')) {
  throw new Error('Selected node should remain highlighted');
}

console.log('Selected node remains highlighted after render');
