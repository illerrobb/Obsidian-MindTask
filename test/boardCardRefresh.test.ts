import { JSDOM } from 'jsdom';
import { BoardView } from '../src/view';
import { TFile } from 'obsidian';

declare global {
  interface Window { ResizeObserver: any; }
}

const dom = new JSDOM('<!doctype html><div id="root"></div>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const boardFile: any = { path: 'board.mtask', basename: 'board', stat: { mtime: 0 } };
Object.setPrototypeOf(boardFile, TFile.prototype);
const otherBoard: any = { path: 'other.mtask', basename: 'other', stat: { mtime: 123 } };
Object.setPrototypeOf(otherBoard, TFile.prototype);

const app: any = {
  vault: {
    read: async (file: any) => {
      if (file === otherBoard) {
        return JSON.stringify({ nodes: { t1: {}, t2: {} } });
      }
      return '';
    },
    modify: async () => {},
    getAbstractFileByPath: (path: string) => (path === 'other.mtask' ? otherBoard : null),
    getMarkdownFiles: () => [],
  },
  workspace: { trigger: () => {} },
};

const view: any = {
  app,
  boardFile,
  board: {
    nodes: {
      b1: {
        x: 0,
        y: 0,
        type: 'board',
        boardPath: 'other.mtask',
        title: 'other',
        name: 'other',
        taskCount: 0,
        completedCount: 0,
      },
    },
    edges: [],
    lanes: {},
  },
  tasks: new Map([
    ['t1', { checked: true }],
    ['t2', { checked: false }],
  ]),
  render: () => {},
};

await (BoardView.prototype as any).updateBoardCardData.call(view, 'other.mtask');

const node = view.board.nodes['b1'];
if (node.taskCount !== 2 || node.completedCount !== 1 || node.lastModified !== 123) {
  throw new Error('Board card did not refresh');
}

console.log('Board card refreshes on mtask change');
