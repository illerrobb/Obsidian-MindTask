import {
  App,
  Plugin,
  TFile,
  FuzzySuggestModal,
  Modal,
  TextComponent,
  Notice,
  Setting,
  normalizePath,
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

    if (this.settings.notesFolder.trim()) {
      const folderPath = normalizePath(this.settings.notesFolder.trim());
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        try {
          await this.app.vault.createFolder(folderPath);
        } catch {
          /* ignore */
        }
      }
    }
    this.applyAlignLineStyles();
    this.addSettingTab(new SettingsTab(this.app, this));
    this.registerView(
      VIEW_TYPE_BOARD,
      (leaf) => new BoardView(leaf, this) as any
    );
    this.registerExtensions(['mtask'], VIEW_TYPE_BOARD);

    this.addCommand({
      id: 'open-board',
      name: 'Open MindTask Board',
      callback: () => this.openBoard(),
    });

    this.addRibbonIcon('plus-square', 'New board', async () => {
      const name = await promptBoardName(this.app);
      if (!name) return;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const folder = this.settings.boardFolder.trim();
      const path = folder
        ? `${folder.replace(/\/$/, '')}/${slug}.mtask`
        : `${slug}.mtask`;
      const file = await getBoardFile(this.app, path);
      await this.openBoardFile(file.path);
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

  applyAlignLineStyles() {
    const root = document.documentElement;
    root.style.setProperty('--align-line-width', `${this.settings.alignLineWidth}px`);
    if (this.settings.alignLineColor) {
      root.style.setProperty('--align-line-color', this.settings.alignLineColor);
    } else {
      root.style.removeProperty('--align-line-color');
    }
  }

  private selectBoard(): Promise<TFile | null> {
    return new Promise((resolve) => {
      const files = this.app.vault
        .getFiles()
        .filter((f) => f.path.endsWith('.mtask'));
      class BoardModal extends FuzzySuggestModal<TFile> {
        constructor(private plugin: MindTaskPlugin, private files: TFile[]) {
          super(plugin.app);
        }
        getItems(): TFile[] {
          return this.files;
        }
        getItemText(item: TFile): string {
          return item.basename;
        }
        onChooseItem(item: TFile) {
          resolve(item);
        }
        onClose() {
          resolve(null);
        }
      }
      new BoardModal(this, files).open();
    });
  }
}

async function promptBoardName(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    class NewBoardModal extends Modal {
      nameInput!: TextComponent;
      constructor(app: App) {
        super(app);
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Create Board' });
        new Setting(contentEl)
          .setName('Name')
          .addText((t) => (this.nameInput = t.setPlaceholder('Board name')));
        new Setting(contentEl)
          .addButton((btn) =>
            btn.setButtonText('Create').setCta().onClick(() => {
              const name = this.nameInput.getValue().trim();
              if (!name) {
                new Notice('Name required');
                return;
              }
              resolve(name);
              this.close();
            })
          )
          .addExtraButton((btn) =>
            btn.setIcon('cross').setTooltip('Cancel').onClick(() => {
              resolve(null);
              this.close();
            })
          );
      }
      onClose() {
        const { contentEl } = this;
        contentEl.empty();
      }
    }
    new NewBoardModal(app).open();
  });
}

