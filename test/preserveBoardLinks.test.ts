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

const file: any = { path: 'task.md', basename: 'task' };
const boardFile: any = { path: 'board.mtask', basename: 'board' };

const app: any = {
  vault: {
    getMarkdownFiles: () => [file],
    read: async () => '- [ ] Task ^t1\n',
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
      b1: { x: 100, y: 100, type: 'board', name: 'B1', taskCount: 0 },
    },
    edges: [{ from: 'b1', to: 't1', type: 'depends' }],
    lanes: {},
  },
  tasks: new Map(),
  plugin: { settings: { tagFilters: [], folderPaths: [], useBlockId: true } },
  selectedIds: new Set(),
  boardEl: dom.window.document.getElementById('root'),
  render: () => {},
};

await (BoardView.prototype as any).refreshFromVault.call(view);

if (view.board.edges.length !== 1) {
  throw new Error('Board-to-task link removed during refresh');
}

console.log('Board-to-task link preserved');
