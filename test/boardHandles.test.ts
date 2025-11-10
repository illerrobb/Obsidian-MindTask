import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { BoardView } from '../src/view';
import Controller from '../src/controller';
import { BoardData } from '../src/boardStore';
import { App, TFile } from 'obsidian';

declare global {
  interface Window {
    ResizeObserver: any;
  }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;

if (!dom.window.PointerEvent) {
  class PEvent extends dom.window.MouseEvent {
    pointerType: string;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.pointerType = init.pointerType || '';
    }
  }
  (dom.window as any).PointerEvent = PEvent as any;
}
(global as any).PointerEvent = dom.window.PointerEvent;

const styleEl = dom.window.document.createElement('style');
styleEl.textContent = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
dom.window.document.head.appendChild(styleEl);

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
  selectedIds: new Set(),
  plugin: { openBoardFile: () => {} },
  drawEdges: () => {},
  updateOverflow: () => {},
};

view.createHandleWithMerge = BoardView.prototype['createHandleWithMerge'];
view.findMergeSource = BoardView.prototype['findMergeSource'];
view.handleMergeClick = BoardView.prototype['handleMergeClick'];

const nodeEl = (BoardView.prototype as any).createNodeElement.call(view, 'b1', root);

const hasIn = nodeEl.querySelector('.vtasks-handle-in');
const hasOut = nodeEl.querySelector('.vtasks-handle-out');

if (!hasIn || !hasOut) {
  throw new Error('Board node is missing connection handles');
}

console.log('Board node has in/out handles');

root.innerHTML = '';
root.className = 'vtasks-board';
(root as any).focus = () => {};
(root as any).blur = () => {};
(root as any).setPointerCapture = () => {};
(root as any).releasePointerCapture = () => {};

const svgEl = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
root.appendChild(svgEl);
const alignV = root.createDiv('vtasks-align-line');
const alignH = root.createDiv('vtasks-align-line');
const minimapEl = root.createDiv('vtasks-minimap');
const minimapSvg = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const minimapView = root.createDiv('vtasks-mini-view');
minimapEl.appendChild(minimapSvg);
minimapEl.appendChild(minimapView);

const touchView: any = {
  board: {
    orientation: 'vertical',
    snapToGrid: true,
    snapToGuides: false,
    lanes: {},
    nodes: {
      b1: { x: 0, y: 0, type: 'board', name: 'B1', taskCount: 0 },
    },
    edges: [],
  },
  tasks: new Map(),
  boardEl: root,
  containerEl: root,
  svgEl,
  alignVLine: alignV,
  alignHLine: alignH,
  minimapEl,
  minimapSvg,
  minimapView,
  selectedIds: new Set(['b1']),
  plugin: { openBoardFile: () => {} },
  drawEdges: () => {},
  drawMinimap: () => {},
  updateMinimapView: () => {},
  moveBoardFromMinimap: () => {},
  updateOverflow: () => {},
  controller: {
    moveLane: () => {},
    assignNodeToLane: () => {},
    moveNode: () => {},
    resizeNode: () => {},
    setNodeColor: () => {},
    attachNode: () => {},
    createEdge: async () => {},
    setCheck: () => {},
  },
  app: {
    vault: {
      getAbstractFileByPath: () => null,
      adapter: {},
      read: async () => '{}',
      modify: async () => {},
      rename: async () => {},
    },
    workspace: { openLinkText: () => {} },
    dragManager: { getData: () => null },
  },
  boardOffsetX: 0,
  boardOffsetY: 0,
  zoom: 1,
  minimapScale: 1,
  minimapOffsetX: 0,
  minimapOffsetY: 0,
  pointerDownSelected: false,
  draggingId: null,
  isMinimapDragging: false,
  dragStartPositions: new Map(),
  memberResizeStart: new Map(),
  laneDragNodeIds: [],
  groupId: null,
  finishEditing: () => {},
  finishEditingEdgeLabel: () => {},
  registerDomEvent: () => {},
  getBoardCoords: () => ({ x: 0, y: 0 }),
  getLaneForPosition: () => null,
  snapNodeToLane: () => {},
  selectNode: () => {},
  addToSelection: () => {},
  updateLaneElement: () => {},
  showAlignmentGuides: () => new Set(),
  hideAlignLine: () => {},
  findAttachmentTarget: () => null,
  computeBoardProgress: async () => ({ total: 0, done: 0 }),
  getDragIds() {
    return new Set(this.selectedIds);
  },
  drawEdgesQueued: () => {},
};

touchView.createHandleWithMerge = BoardView.prototype['createHandleWithMerge'];
touchView.findMergeSource = BoardView.prototype['findMergeSource'];
touchView.handleMergeClick = BoardView.prototype['handleMergeClick'];

const touchNode = (BoardView.prototype as any).createNodeElement.call(touchView, 'b1', root);
(BoardView.prototype as any).registerEvents.call(touchView);

const touchEvent = new dom.window.PointerEvent('pointerdown', {
  pointerType: 'touch',
  bubbles: true,
  button: 0,
});

Object.defineProperty(touchEvent, 'target', { value: touchNode, configurable: true });
(touchView.boardEl.onpointerdown as any)?.call(touchView.boardEl, touchEvent);
if (!root.classList.contains('touch-handles')) {
  throw new Error('Touch interaction should enable touch-handles class');
}

if (!touchView.pointerDownSelected) {
  throw new Error('Pointer down handler did not execute');
}

const touchHandle = touchNode.querySelector('.vtasks-handle') as HTMLElement | null;
if (!touchHandle) {
  throw new Error('Touch node is missing handle');
}

const opacity = dom.window.getComputedStyle(touchHandle).opacity;
if (opacity !== '1') {
  throw new Error('Touch pointer should reveal selected node handles');
}

console.log('Touch pointer interaction reveals selected node handles');

(async () => {
  const stored: Record<string, string> = {};
  const app = new App();
  app.vault.read = async (file: TFile) => stored[file.path] || '';
  app.vault.modify = async (file: TFile, data: string) => {
    stored[file.path] = data;
  };
  app.vault.getAbstractFileByPath = (path: string) => {
    const file = new TFile();
    file.path = path;
    file.basename = path.replace(/\.mtask$/, '');
    file.stat = { mtime: Date.now() } as any;
    return file;
  };

  const boardFile = app.vault.getAbstractFileByPath('merge.mtask') as TFile;
  const board: BoardData = {
    version: 1,
    nodes: {
      source: { x: 0, y: 0, title: 'Source task', description: 'Orig desc' },
      target: { x: 160, y: 0, title: 'Target task', description: 'Base desc' },
      child: { x: 80, y: 40, attachedTo: 'source' } as any,
    },
    edges: [
      { from: 'source', to: 'target', type: 'depends', label: 'forward' },
      { from: 'target', to: 'source', type: 'depends', label: 'back' },
    ],
    lanes: {},
    title: 'merge',
    orientation: 'vertical',
    snapToGrid: true,
    snapToGuides: false,
    alignThreshold: 5,
  };
  stored[boardFile.path] = JSON.stringify(board);

  const taskFile = new TFile();
  taskFile.path = 'tasks.md';
  taskFile.basename = 'tasks';

  const tasks = new Map<string, any>();
  tasks.set('source', {
    file: taskFile,
    line: 0,
    text: '- [ ] Source task',
    checked: false,
    blockId: 'source',
    indent: 0,
    dependsOn: [],
    description: 'Task description',
    notePath: 'docs/source.md',
  });

  const controller = new Controller(app as any, boardFile, board, tasks, {} as any);

  const mergeRoot = document.createElement('div');
  mergeRoot.className = 'vtasks-board vtasks-vertical';
  const mergeView: any = {
    board,
    boardEl: mergeRoot,
    controller,
    selectedIds: new Set(['source']),
    plugin: { openBoardFile: () => {} },
    tasks,
    drawEdges: () => {},
    updateOverflow: () => {},
    app,
    renderCalled: 0,
    render() {
      this.renderCalled++;
    },
  };

  mergeView.createHandleWithMerge = BoardView.prototype['createHandleWithMerge'];
  mergeView.findMergeSource = BoardView.prototype['findMergeSource'];
  mergeView.handleMergeClick = BoardView.prototype['handleMergeClick'];

  const targetEl = (BoardView.prototype as any).createNodeElement.call(
    mergeView,
    'target',
    mergeRoot,
  );
  const mergeBtn = targetEl.querySelector('button.vtasks-merge') as HTMLButtonElement | null;
  if (!mergeBtn) {
    throw new Error('Merge button not rendered on node handles');
  }

  mergeBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  if (!mergeView.renderCalled) {
    throw new Error('Merge action should trigger a rerender');
  }
  if (board.nodes.source) {
    throw new Error('Source node should be removed after merge');
  }
  if ((board.nodes.child as any).attachedTo !== 'target') {
    throw new Error('Attached nodes should retarget the merge destination');
  }
  if (board.edges.some((e) => e.from === 'source' || e.to === 'source')) {
    throw new Error('Edges should be rewired away from the removed node');
  }
  const targetNode = board.nodes.target as any;
  if (!targetNode.mergedFrom || !targetNode.mergedFrom.includes('source')) {
    throw new Error('Merged IDs should be tracked on the destination node');
  }
  if (!targetNode.description || !targetNode.description.includes('Task description')) {
    throw new Error('Merged description should be appended to the destination');
  }

  const saved = JSON.parse(stored[boardFile.path]);
  if (saved.nodes.source) {
    throw new Error('Merged board state should not persist the removed node');
  }
  if (!(saved.nodes.target as any).mergedFrom?.includes('source')) {
    throw new Error('Persisted board should record merged IDs');
  }

  console.log('Merge button merges nodes and persists board');
})();
