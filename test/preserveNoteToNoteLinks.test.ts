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
    read: async () => '- [ ] Task1 [dependsOn:: t2] ^t1\n- [ ] Task2 ^t2\n',
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
      t2: { x: 50, y: 50 },
      n1: { x: 100, y: 100, notePath: 'note1.md' },
      n2: { x: 200, y: 200, notePath: 'note2.md' },
    },
    edges: [{ from: 'n1', to: 'n2', type: 'link' }],
    lanes: {},
  },
  tasks: new Map(),
  plugin: { settings: { tagFilters: [], folderPaths: [], useBlockId: true } },
  selectedIds: new Set(),
  boardEl: dom.window.document.getElementById('root'),
  render: () => {},
};

await (BoardView.prototype as any).refreshFromVault.call(view);

const edge1 = view.board.edges.find((e: any) => e.from === 'n1' && e.to === 'n2');
const edge2 = view.board.edges.find((e: any) => e.from === 't2' && e.to === 't1');

if (!edge1 || !edge2 || view.board.edges.length !== 2) {
  throw new Error('Edges not preserved or merged during refresh');
}

console.log('Note-to-note link and dependency preserved');
