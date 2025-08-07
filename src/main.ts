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
import { getBoardFile } from './boardStore';
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  SettingsTab,
  PluginData,
} from './settings';

export default class MindTaskPlugin extends Plugin {
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
    } else {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerView(
      VIEW_TYPE_BOARD,
      (leaf) => new BoardView(leaf, this) as any
    );
    this.registerExtensions(['mtask'], VIEW_TYPE_BOARD);
    this.observeExplorer();

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
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, state: { file: path }, active: true });
  }

  async updateFilters(tags: string[], folders: string[]) {
    this.settings.tagFilters = tags;
    this.settings.folderPaths = folders;
    await this.savePluginData();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD);
    for (const leaf of leaves) {
      const view = leaf.view as unknown as BoardView;
      await view.refreshFromVault();
    }
  }

  async savePluginData() {
    const data: PluginData = { settings: this.settings };
    await this.saveData(data);
  }

  private selectBoard(): Promise<TFile | null> {
    return new Promise((resolve) => {
      const createItem = 'Create new board...';
      const files = this.app.vault
        .getFiles()
        .filter((f) => f.path.endsWith('.mtask'));
      class BoardModal extends FuzzySuggestModal<TFile | string> {
        constructor(private plugin: MindTaskPlugin, private files: TFile[]) {
          super(plugin.app);
        }
        getItems(): (TFile | string)[] {
          return [...this.files, createItem];
        }
        getItemText(item: TFile | string): string {
          return typeof item === 'string' ? item : item.basename;
        }
        onChooseItem(item: TFile | string) {
          if (typeof item === 'string') {
            this.close();
            this.plugin.createBoard().then(resolve);
          } else {
            resolve(item);
          }
        }
      }
      new BoardModal(this, files).open();
    });
  }

  private createBoard(): Promise<TFile | null> {
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
                const file = await getBoardFile(this.plugin.app, path);
                resolve(file);
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
