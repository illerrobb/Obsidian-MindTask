import { Plugin, TFile } from 'obsidian';
import { scanFiles, ParsedTask, parseDependencies } from './parser';
import { BoardView, VIEW_TYPE_BOARD } from './view';
import { getBoardFile, loadBoard, saveBoard } from './boardStore';
import Controller from './controller';

export default class VisualTasksPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'open-board',
      name: 'Open Tasks Board',
      callback: () => this.openBoard()
    });
  }

  async openBoard() {
    const files = this.app.vault.getMarkdownFiles();
    const tasks = await scanFiles(this.app, files);
    const deps = parseDependencies(tasks);
    const boardFile = await getBoardFile(this.app, 'tasks.vtasks.json');
    const board = await loadBoard(this.app, boardFile);

    for (const task of tasks) {
      if (!board.nodes[task.blockId]) {
        board.nodes[task.blockId] = { x: 20, y: 20 };
      }
    }

    await saveBoard(this.app, boardFile, board);

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
    const view = new BoardView(leaf, board);
    leaf.view = view;
  }
}
