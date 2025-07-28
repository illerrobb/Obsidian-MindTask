import { Plugin, TFile } from 'obsidian';
import { BoardView, VIEW_TYPE_BOARD } from './view';
import { BoardData, loadBoard, saveBoard, getBoardFile } from './boardStore';
import { scanFiles, parseDependencies, ParsedTask } from './parser';
import Controller from './controller';
import { PluginSettings, DEFAULT_SETTINGS, SettingsTab } from './settings';

export default class VisualTasksPlugin extends Plugin {
  private board: BoardData | null = null;
  private boardFile: TFile | null = null;
  private tasks: Map<string, ParsedTask> = new Map();
  private controller: Controller | null = null;
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerView(VIEW_TYPE_BOARD, (leaf) => {
      if (!this.board || !this.controller) {
        throw new Error('Board not loaded');
      }
      return new BoardView(leaf, this.controller!, this.board!, this.tasks);
    });

    this.registerEvent(
      this.app.vault.on('create', () => this.refreshFromVault())
    );
    this.registerEvent(
      this.app.vault.on('modify', () => this.refreshFromVault())
    );
    this.registerEvent(
      this.app.vault.on('delete', () => this.refreshFromVault())
    );

    this.addCommand({
      id: 'open-board',
      name: 'Open Tasks Board',
      callback: () => this.openBoard(),
    });
  }

  async openBoard() {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files);
    this.tasks = new Map(parsed.map((t) => [t.blockId, t]));
    const deps = parseDependencies(parsed);

    this.boardFile = await getBoardFile(this.app, this.settings.boardFilePath);
    this.board = await loadBoard(this.app, this.boardFile);

    for (const task of parsed) {
      if (!this.board.nodes[task.blockId]) {
        this.board.nodes[task.blockId] = { x: 20, y: 20 };
      }
    }
    for (const dep of deps) {
      if (!this.board.edges.find((e) => e.from === dep.from && e.to === dep.to && e.type === dep.type)) {
        this.board.edges.push(dep);
      }
    }

    await saveBoard(this.app, this.boardFile, this.board);

    this.controller = new Controller(
      this.app,
      this.boardFile,
      this.board,
      this.tasks,
      this.settings
    );

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
  }

  private async refreshFromVault() {
    if (!this.board || !this.boardFile) return;

    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files);
    const deps = parseDependencies(parsed);

    this.tasks.clear();
    for (const task of parsed) {
      this.tasks.set(task.blockId, task);
      if (!this.board.nodes[task.blockId]) {
        this.board.nodes[task.blockId] = { x: 20, y: 20 };
      }
    }

    for (const id of Object.keys(this.board.nodes)) {
      if (!this.tasks.has(id)) delete this.board.nodes[id];
    }

    this.board.edges = this.board.edges.filter(
      (e) => this.tasks.has(e.from) && this.tasks.has(e.to)
    );

    for (const dep of deps) {
      if (
        !this.board.edges.find(
          (e) => e.from === dep.from && e.to === dep.to && e.type === dep.type
        )
      ) {
        this.board.edges.push(dep);
      }
    }

    await saveBoard(this.app, this.boardFile, this.board);

    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD)[0];
    if (leaf) {
      (leaf.view as BoardView).updateData(this.board, this.tasks);
    }
  }
}
