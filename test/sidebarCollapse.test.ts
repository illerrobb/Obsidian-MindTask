import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';
import { WorkspaceLeaf } from 'obsidian';

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;

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
  for (const k of Object.keys(opts)) {
    if (k !== 'cls' && k !== 'text') el.setAttribute(k, opts[k]);
  }
  this.appendChild(el);
  return el;
};
proto.empty = function() { this.innerHTML = ''; };
proto.addClass = function(cls: string) { this.classList.add(cls); };
proto.removeClass = function(cls: string) { this.classList.remove(cls); };
proto.toggleClass = function(cls: string, force?: boolean) { this.classList.toggle(cls, force); };
proto.setText = function(text: string) { this.textContent = text; };

const elemProto = dom.window.Element.prototype as any;
elemProto.setAttr = function(name: string, value: string) { this.setAttribute(name, value); };
elemProto.getAttr = function(name: string) { return this.getAttribute(name); };

const svgProto = dom.window.SVGElement.prototype as any;
svgProto.addClass = function(cls: string) { this.classList.add(cls); };
svgProto.removeClass = function(cls: string) { this.classList.remove(cls); };
svgProto.empty = function() { while (this.firstChild) this.removeChild(this.firstChild); };

const plugin: any = { settings: { sidebarWidth: 200 }, savePluginData: async () => {} };
const view = new BoardView(new WorkspaceLeaf(), plugin);
(view as any).board = { version: 1, nodes: {}, edges: [], lanes: {}, orientation: 'vertical', snapToGrid: true, snapToGuides: false, alignThreshold: 5 };
(view as any).tasks = new Map();

(view as any).render();
(view as any).toggleSidebar();
(view as any).render();

if (!(view as any).sidebarEl.classList.contains('collapsed')) {
  throw new Error('Collapsed sidebar should remain collapsed after render');
}

console.log('Collapsed sidebar remains collapsed after render');
