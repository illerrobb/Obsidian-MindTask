import { App, TFile } from 'obsidian';
import Controller from '../src/controller';
import { loadBoard, BoardData } from '../src/boardStore';

(async () => {
  const stored: Record<string, string> = {};
  const app = new App();
  app.vault.read = async (file: TFile) => stored[file.path] || '';
  app.vault.modify = async (file: TFile, data: string) => {
    stored[file.path] = data;
  };
  app.vault.getAbstractFileByPath = (p: string) => {
    const f = new TFile();
    f.path = p;
    f.basename = p.split('/').pop()!.replace(/\.mtask$/, '');
    f.stat = { mtime: 0 } as any;
    return f;
  };

  const boardFile = app.vault.getAbstractFileByPath('board.mtask') as TFile;
  const board: BoardData = {
    version: 1,
    nodes: {},
    edges: [],
    lanes: {},
    title: 'board',
    orientation: 'vertical',
    snapToGrid: true,
    snapToGuides: false,
    alignThreshold: 5,
  };
  stored[boardFile.path] = JSON.stringify(board);

  const controller = new Controller(app as any, boardFile, board, new Map(), {} as any);
  const id = await controller.addPostIt(10, 20);
  await controller.updatePostItContent(id, 'hello');
  const reloaded = await loadBoard(app as any, boardFile);
  if ((reloaded.nodes[id] as any).content !== 'hello') {
    throw new Error('Post-it did not persist');
  }
  console.log('Post-it node saved and reloaded');
})();
