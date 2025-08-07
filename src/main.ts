import {
  Plugin,
  TFile,
  FuzzySuggestModal,
  Modal,
  TextComponent,
  Notice,
  Setting,
} from 'obsidian';
import { BoardView, VIEW_TYPE_BOARD } from './view';
import { loadBoard, getBoardFile } from './boardStore';
import { scanFiles } from './parser';
import type { ParsedTask } from './parser';
import Controller from './controller';
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  SettingsTab,
  BoardInfo,
  PluginData,
} from './settings';

export default class MindTaskPlugin extends Plugin {
  boards: BoardInfo[] = [];
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
    this.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardView(leaf, this));
    this.registerExtensions(['mtask'], VIEW_TYPE_BOARD);
    this.observeExplorer();

    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (!file || !file.path.endsWith('.mtask')) return;
        await this.openBoardFile(file.path);
      })
    );

    this.addCommand({
      id: 'open-board',
      name: 'Open MindTask Board',
      callback: () => this.openBoard(),
    });
  }

  async openBoard() {
    const board = await this.selectBoard();
    if (!board) return;
    await this.openBoardFile(board.path);
  }

  async openBoardFile(path: string) {
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.settings.tagFilters,
      folders: this.settings.folderPaths,
      useBlockId: this.settings.useBlockId,
    });
    const tasks: Map<string, ParsedTask> = new Map(
      parsed.map((t) => [t.blockId, t])
    );

    const boardFile = await getBoardFile(this.app, path);
    const board = await loadBoard(this.app, boardFile);
    const base = path.split('/').pop()!.replace(/\.mtask$/, '');

    await this.updateBoardInfo(boardFile.path, board.title || base);

    const controller = new Controller(
      this.app,
      boardFile,
      board,
      tasks,
      this.settings
    );

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
    const view = this.app.workspace.getActiveViewOfType(BoardView);
    if (view) {
      view.updateData(board, tasks, controller, boardFile);
    }
  }

  async updateFilters(tags: string[], folders: string[]) {
    this.settings.tagFilters = tags;
    this.settings.folderPaths = folders;
    await this.savePluginData();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD);
    for (const leaf of leaves) {
      const view = leaf.view as BoardView;
      await view.refreshFromVault();
    }
  }

  async updateBoardInfo(path: string, title: string) {
    const info = this.boards.find((b) => b.path === path);
    if (info) {
      info.name = title;
    } else {
      this.boards.push({ path, name: title });
    }
    await this.savePluginData();
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
