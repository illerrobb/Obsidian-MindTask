import { Plugin, TFile, TAbstractFile, FuzzySuggestModal, Modal, TextComponent, Notice, Setting } from 'obsidian';
import { BoardView, VIEW_TYPE_BOARD } from './view';
import { BoardData, loadBoard, saveBoard, getBoardFile } from './boardStore';
import { scanFiles, parseDependencies, ParsedTask, ScanOptions } from './parser';
import Controller from './controller';
import { PluginSettings, DEFAULT_SETTINGS, SettingsTab, BoardInfo, PluginData } from './settings';

export default class MindTaskPlugin extends Plugin {
  private board: BoardData | null = null;
  private boardFile: TFile | null = null;
  private tasks: Map<string, ParsedTask> = new Map();
  private controller: Controller | null = null;
  boards: BoardInfo[] = [];
  private activeBoard: BoardInfo | null = null;
  settings: PluginSettings = DEFAULT_SETTINGS;
  private explorerObserver: MutationObserver | null = null;

  private updateExplorerTitles() {
    const leaves = this.app.workspace.getLeavesOfType('file-explorer');
    for (const leaf of leaves) {
      const root = leaf.view.containerEl;
      root
        .querySelectorAll<HTMLElement>(
          '.nav-file-title[data-path$=".mtask"] .nav-file-title-content'
        )
        .forEach((el) => {
          const title = el.textContent || '';
          if (!el.dataset.origTitle) {
            el.dataset.origTitle = title;
          }
          const parent = el.parentElement as HTMLElement;
          const path = parent.getAttribute('data-path') || '';
          const base = path
            .split('/')
            .pop()!
            .replace(/\.mtask$/, '');
          el.textContent = base;
          parent.classList.add('mindtask-file');
          parent.onmousedown = (evt) => {
            if (evt.button !== 0) return;
            evt.preventDefault();
            evt.stopPropagation();
            void this.openBoardFile(path);
          };
        });
    }
  }

  private restoreExplorerTitles() {
    document
      .querySelectorAll<HTMLElement>('.nav-file-title-content[data-orig-title]')
      .forEach((el) => {
        el.textContent = el.dataset.origTitle!;
        el.removeAttribute('data-orig-title');
        const parent = el.parentElement as HTMLElement;
        parent.classList.remove('mindtask-file');
        parent.onmousedown = null;
      });
  }

  private observeExplorer() {
    this.updateExplorerTitles();
    const leaves = this.app.workspace.getLeavesOfType('file-explorer');
    if (!leaves.length) return;
    const root = leaves[0].view.containerEl;
    this.explorerObserver = new MutationObserver(() => this.updateExplorerTitles());
    this.explorerObserver.observe(root, { childList: true, subtree: true });
    this.registerEvent(this.app.vault.on('rename', () => this.updateExplorerTitles()));
    this.registerEvent(this.app.vault.on('create', () => this.updateExplorerTitles()));
    this.registerEvent(this.app.vault.on('delete', () => this.updateExplorerTitles()));
  }

  async onload() {
    const data = (await this.loadData()) as Partial<PluginData> | null;
    if (data) {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      if (
        Array.isArray((this.settings as any).backgroundColors) &&
        typeof (this.settings as any).backgroundColors[0] === 'string'
      ) {
        this.settings.backgroundColors = ((this.settings as any)
          .backgroundColors as unknown as string[]).map((c) => ({ color: c }));
      }
      this.boards = data.boards ?? [];
    } else {
      this.settings = { ...DEFAULT_SETTINGS };
      this.boards = [];
    }
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerView(VIEW_TYPE_BOARD, (leaf) =>
      new BoardView(
        leaf,
        this.controller,
        this.board,
        this.tasks,
        (title) => this.renameActiveBoard(title),
        this
      )
    );
    this.registerExtensions(['mtask'], VIEW_TYPE_BOARD);
    this.observeExplorer();

    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (!file || !file.path.endsWith('.mtask')) return;
        await this.openBoardFile(file.path);
      })
    );

    const onVaultChange = (file: TAbstractFile) => {
      if (!this.boardFile) return;
      if (file.path === this.boardFile.path) return;
      this.refreshFromVault();
    };
    this.registerEvent(this.app.vault.on('create', onVaultChange));
    this.registerEvent(this.app.vault.on('modify', onVaultChange));
    this.registerEvent(this.app.vault.on('delete', onVaultChange));

    this.addCommand({
      id: 'open-board',
      name: 'Open MindTask Board',
      callback: () => this.openBoard(),
    });
  }

  async openBoard() {
    let board = await this.selectBoard();
    if (!board) return;
    this.activeBoard = board;
    await this.loadBoardData(board.path);
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
  }

  async openBoardFile(path: string) {
    const base = path
      .split('/')
      .pop()!
      .replace(/\.mtask$/, '');
    this.activeBoard = { name: base, path };
    await this.loadBoardData(path);
    let view = this.app.workspace.getActiveViewOfType(BoardView);
    if (view && this.board && this.controller) {
      view.updateData(this.board, this.tasks, this.controller);
    } else {
      const leaf = this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
      // After creating the leaf, ensure the view is updated with board data
      view = this.app.workspace.getActiveViewOfType(BoardView);
      if (view && this.board && this.controller) {
        view.updateData(this.board, this.tasks, this.controller);
      }
    }
  }

  private async loadBoardData(path: string) {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.settings.tagFilters,
      folders: this.settings.folderPaths,
      useBlockId: this.settings.useBlockId,
    });
    const deps = parseDependencies(parsed);

    this.tasks = new Map(parsed.map((t) => [t.blockId, t]));

    this.boardFile = await getBoardFile(this.app, path);
    this.board = await loadBoard(this.app, this.boardFile);
    if (this.activeBoard) {
      this.activeBoard.name = this.board.title || this.activeBoard.name;
      const info = this.boards.find((b) => b.path === this.activeBoard!.path);
      if (info) info.name = this.activeBoard.name;
      await this.savePluginData();
    }

    for (const dep of deps) {
      if (
        this.board!.nodes[dep.from] &&
        this.board!.nodes[dep.to] &&
        !this.board.edges.find(
          (e) => e.from === dep.from && e.to === dep.to && e.type === dep.type
        )
      ) {
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
  }

  async updateFilters(tags: string[], folders: string[]) {
    this.settings.tagFilters = tags;
    this.settings.folderPaths = folders;
    await this.savePluginData();
    await this.refreshFromVault();
  }

  private async renameActiveBoard(title: string) {
    if (!this.board || !this.boardFile) return;
    this.board.title = title;
    await saveBoard(this.app, this.boardFile, this.board);
    if (this.activeBoard) this.activeBoard.name = title;
    const info = this.boards.find((b) => b.path === this.activeBoard?.path);
    if (info) info.name = title;
    await this.savePluginData();
  }

  private async refreshFromVault() {
    if (!this.board || !this.boardFile) return;

    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.settings.tagFilters,
      folders: this.settings.folderPaths,
      useBlockId: this.settings.useBlockId,
    });
    const deps = parseDependencies(parsed);

    this.tasks.clear();
    for (const task of parsed) {
      this.tasks.set(task.blockId, task);
    }

    for (const id of Object.keys(this.board.nodes)) {
      const n = this.board.nodes[id] as any;
      if (!this.tasks.has(id) && n.type !== 'group') delete this.board.nodes[id];
    }

    this.board.edges = this.board.edges.filter(
      (e) =>
        (this.tasks.has(e.from) || this.board!.nodes[e.from]?.type === 'group') &&
        (this.tasks.has(e.to) || this.board!.nodes[e.to]?.type === 'group')
    );

    const existing = this.board.edges.filter((e) =>
      deps.some((d) => d.from === e.from && d.to === e.to && d.type === e.type)
    );

    for (const dep of deps) {
      if (
        this.board.nodes[dep.from] &&
        this.board.nodes[dep.to] &&
        !existing.find(
          (e) => e.from === dep.from && e.to === dep.to && e.type === dep.type
        )
      ) {
        existing.push(dep);
      }
    }

    this.board.edges = existing;

    await saveBoard(this.app, this.boardFile, this.board);

    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD)[0];
    if (leaf && this.controller) {
      (leaf.view as BoardView).updateData(this.board, this.tasks, this.controller);
    }
  }

  async savePluginData() {
    const data: PluginData = { settings: this.settings, boards: this.boards };
    await this.saveData(data);
  }

  private selectBoard(): Promise<BoardInfo | null> {
    return new Promise((resolve) => {
      const createItem: BoardInfo = { name: 'Create new board...', path: '' };
      class BoardModal extends FuzzySuggestModal<BoardInfo> {
        constructor(private plugin: MindTaskPlugin) {
          super(plugin.app);
        }
        getItems(): BoardInfo[] {
          return [...this.plugin.boards, createItem];
        }
        getItemText(item: BoardInfo): string {
          return item === createItem ? 'Create new board...' : item.name;
        }
        onChooseItem(item: BoardInfo) {
          if (item === createItem) {
            this.close();
            this.plugin.createBoard().then(resolve);
          } else {
            resolve(item);
          }
        }
      }
      new BoardModal(this).open();
    });
  }

  private createBoard(): Promise<BoardInfo | null> {
    return new Promise((resolve) => {
      class NewBoardModal extends Modal {
        nameInput!: TextComponent;
        constructor(private plugin: MindTaskPlugin) {
          super(plugin.app);
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.createEl('h2', { text: 'Create Board' });
          new Setting(contentEl)
            .setName('Name')
            .addText((t) => (this.nameInput = t.setPlaceholder('Board name')));
          new Setting(contentEl)
            .addButton((btn) =>
              btn.setButtonText('Create').setCta().onClick(async () => {
                const name = this.nameInput.getValue().trim();
                if (!name) {
                  new Notice('Name required');
                  return;
                }
                const slug = name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '');
                const folder = this.plugin.settings.boardFolder.trim();
                const path = folder
                  ? `${folder.replace(/\/$/, '')}/${slug}.mtask`
                  : `${slug}.mtask`;
                const info: BoardInfo = { name, path };
                this.plugin.boards.push(info);
                await getBoardFile(this.plugin.app, path);
                await this.plugin.savePluginData();
                resolve(info);
                this.close();
              })
            )
            .addExtraButton((btn) =>
              btn.setIcon('cross').setTooltip('Cancel').onClick(() => {
                this.close();
                resolve(null);
              })
            );
        }
        onClose() {
          const { contentEl } = this;
          contentEl.empty();
        }
      }
      new NewBoardModal(this).open();
    });
  }

  onunload() {
    this.restoreExplorerTitles();
    if (this.explorerObserver) {
      this.explorerObserver.disconnect();
      this.explorerObserver = null;
    }
  }
}
