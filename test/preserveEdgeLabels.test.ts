import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';

declare global {
  interface Window { ResizeObserver: any; }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const file: any = { path: 'tasks.md', basename: 'tasks' };
const boardFile: any = { path: 'board.mtask', basename: 'board' };

const app: any = {
  vault: {
    getMarkdownFiles: () => [file],
    read: async () => '- [ ] Task1 ^t1\n- [ ] Task2 [dependsOn:: t1] ^t2\n',
    modify: async () => {},
    getAbstractFileByPath: () => null,
  },
};

const view: any = {
  app,
  boardFile,
  board: {
    nodes: {
      t1: { x: 0, y: 0 },
      t2: { x: 100, y: 0 },
    },
    edges: [{ from: 't1', to: 't2', type: 'depends', label: 'custom' }],
    lanes: {},
  },
  tasks: new Map(),
  plugin: { settings: { tagFilters: [], folderPaths: [], useBlockId: true } },
  selectedIds: new Set(),
  boardEl: dom.window.document.getElementById('root'),
  render: () => {},
};

await (BoardView.prototype as any).refreshFromVault.call(view);

const edge = view.board.edges[0];
if (edge.label !== 'custom') {
  throw new Error('Edge label removed during refresh');
}

console.log('Edge label preserved');
