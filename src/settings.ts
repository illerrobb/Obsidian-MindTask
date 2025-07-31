import { App, PluginSettingTab, Setting } from 'obsidian';
import MindTaskPlugin from './main';

export interface BoardInfo {
  name: string;
  path: string;
}

export interface PluginSettings {
  defaultTaskFile: string;
  tagFilters: string[];
  folderPaths: string[];
  /** Use ^id block anchors rather than [id:: ] inline fields */
  useBlockId: boolean;
  /** Folder to store board files */
  boardFolder: string;
}

export interface PluginData {
  settings: PluginSettings;
  boards: BoardInfo[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultTaskFile: 'Tasks.md',
  tagFilters: [],
  folderPaths: [],
  useBlockId: true,
  boardFolder: '',
};

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: MindTaskPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Boards' });
    const boardsEl = containerEl.createDiv();
    this.plugin.boards.forEach((b, i) => {
      const boardSetting = new Setting(boardsEl).setName(b.name);
      boardSetting
        .addText((text) =>
          text
            .setPlaceholder('Board name')
            .setValue(b.name)
            .onChange(async (v) => {
              b.name = v;
              boardSetting.setName(v);
              await this.plugin.savePluginData();
            })
        )
        .addText((text) =>
          text
            .setPlaceholder('tasks.vtasks.json')
            .setValue(b.path)
            .onChange(async (v) => {
              b.path = v.trim();
              await this.plugin.savePluginData();
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon('trash')
            .setTooltip('Delete')
            .onClick(async () => {
              this.plugin.boards.splice(i, 1);
              await this.plugin.savePluginData();
              this.display();
            })
        );
    });

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText('Add board')
          .setCta()
          .onClick(async () => {
            this.plugin.boards.push({ name: 'New Board', path: 'tasks.vtasks.json' });
            await this.plugin.savePluginData();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName('Board folder')
      .setDesc('Folder where new board files are stored')
      .addText((text) =>
        text
          .setPlaceholder('(root)')
          .setValue(this.plugin.settings.boardFolder)
          .onChange(async (value) => {
            this.plugin.settings.boardFolder = value.trim();
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName('Default note for tasks')
      .setDesc('File used when creating new tasks')
      .addText((text) =>
        text
          .setPlaceholder('Tasks.md')
          .setValue(this.plugin.settings.defaultTaskFile)
          .onChange(async (value) => {
            this.plugin.settings.defaultTaskFile = value.trim();
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName('Tag filters')
      .setDesc('Comma separated list of tags to include')
      .addText((text) =>
        text
          .setPlaceholder('#tag1, #tag2')
          .setValue(this.plugin.settings.tagFilters.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.tagFilters = value
              .split(',')
              .map((v) => v.trim().replace(/^#/, ''))
              .filter((v) => v.length > 0);
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName('Folder filters')
      .setDesc('Comma separated list of folders to include')
      .addText((text) =>
        text
          .setPlaceholder('Path/To/Folder')
          .setValue(this.plugin.settings.folderPaths.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.folderPaths = value
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v.length > 0);
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName('Use block IDs')
      .setDesc('Add tasks with ^id anchors instead of [id::] fields')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useBlockId)
          .onChange(async (value) => {
            this.plugin.settings.useBlockId = value;
            await this.plugin.savePluginData();
          })
      );
  }
}
