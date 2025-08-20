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

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = RO;

const hProto = dom.window.HTMLElement.prototype as any;
hProto.createDiv = function(arg: any) {
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
hProto.createSpan = function(arg: any) {
  const el = dom.window.document.createElement('span');
  if (arg?.cls) el.className = arg.cls;
  if (arg?.text) el.textContent = arg.text;
  this.appendChild(el);
  return el;
};
hProto.setAttr = function(name: string, value: string) {
  this.setAttribute(name, value);
};
hProto.addClass = function(cls: string) {
  this.classList.add(cls);
};
hProto.removeClass = function(cls: string) {
  this.classList.remove(cls);
};
hProto.setText = function(text: string) {
  this.textContent = text;
};

const sProto = dom.window.SVGElement.prototype as any;
sProto.setAttr = function(name: string, value: string) {
  this.setAttribute(name, value);
};
sProto.addClass = function(cls: string) {
  this.classList.add(cls);
};
sProto.removeClass = function(cls: string) {
  this.classList.remove(cls);
};

const root = document.getElementById('root')!;

const view: any = {
  board: {
    orientation: 'vertical',
    nodes: {
      b1: { x: 0, y: 0, type: 'board', name: 'B1', taskCount: 0 },
      b2: { x: 100, y: 100, type: 'board', name: 'B2', taskCount: 0 },
    },
    edges: [ { from: 'b1', to: 'b2', type: 'depends' } ],
  },
  tasks: new Map(),
  boardEl: root,
  svgEl: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  edgeEls: new Map(),
  controller: { settings: {} },
  groupId: null,
  selectedIds: new Set(),
  drawMinimap: () => {},
  updateOverflow: () => {},
};

(BoardView.prototype as any).createNodeElement.call(view, 'b1', root);
(BoardView.prototype as any).createNodeElement.call(view, 'b2', root);

(BoardView.prototype as any).drawEdges.call(view);

const fromHandle = root.querySelector('.vtasks-node[data-id="b1"] .vtasks-handle-out');
const toHandle = root.querySelector('.vtasks-node[data-id="b2"] .vtasks-handle-in');

if (!fromHandle?.classList.contains('vtasks-handle-connected') ||
    !toHandle?.classList.contains('vtasks-handle-connected')) {
  throw new Error('Connected handles should be visible');
}

console.log('Connected handles are visible');
