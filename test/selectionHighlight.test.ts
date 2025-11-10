import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

declare global {
  interface Window { ResizeObserver: any; }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const styleEl = dom.window.document.createElement('style');
styleEl.textContent = css;
dom.window.document.head.appendChild(styleEl);
dom.window.document.documentElement.style.setProperty('--color-accent', 'rgb(255, 0, 0)');
dom.window.document.documentElement.style.setProperty('--color-green', 'rgb(0, 255, 0)');
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
proto.createEl = function(tag: string, opts: any = {}) {
  const el = dom.window.document.createElement(tag);
  if (opts.cls) el.className = opts.cls;
  if (opts.text) el.textContent = opts.text;
  if (opts.type) (el as any).type = opts.type;
  if (opts.attr) {
    for (const [name, value] of Object.entries(opts.attr)) {
      el.setAttribute(name, value as string);
    }
  }
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

view.createHandleWithMerge = BoardView.prototype['createHandleWithMerge'];
view.findMergeSource = BoardView.prototype['findMergeSource'];
view.handleMergeClick = BoardView.prototype['handleMergeClick'];

(BoardView.prototype as any).createNodeElement.call(view, 't1', root);

const node = root.querySelector('.vtasks-node[data-id="t1"]');
if (!node?.classList.contains('selected')) {
  throw new Error('Selected node should remain highlighted');
}

console.log('Selected node remains highlighted after render');

root.innerHTML = '';
view.tasks.set('t1', { checked: true });
(BoardView.prototype as any).createNodeElement.call(view, 't1', root);
const doneNode = root.querySelector('.vtasks-node[data-id="t1"]') as HTMLElement;
const outline = dom.window.getComputedStyle(doneNode).outline;
if (!outline.includes('var(--color-accent)')) {
  throw new Error('Selected done node should use accent outline color');
}
console.log('Selected done node uses accent outline color');
