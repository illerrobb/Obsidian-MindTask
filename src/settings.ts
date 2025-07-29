import { App, PluginSettingTab, Setting } from 'obsidian';
import MindTaskPlugin from './main';

export interface PluginSettings {
  boardFilePath: string;
  defaultTaskFile: string;
  tagFilters: string[];
  folderPaths: string[];
  /** Use ^id block anchors rather than [id:: ] inline fields */
  useBlockId: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  boardFilePath: 'tasks.vtasks.json',
  defaultTaskFile: 'Tasks.md',
  tagFilters: [],
  folderPaths: [],
  useBlockId: true,
};

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: MindTaskPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Board JSON path')
      .setDesc('Location where board data is stored')
      .addText((text) =>
        text
          .setPlaceholder('tasks.vtasks.json')
          .setValue(this.plugin.settings.boardFilePath)
          .onChange(async (value) => {
            this.plugin.settings.boardFilePath = value.trim();
            await this.plugin.saveData(this.plugin.settings);
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
            await this.plugin.saveData(this.plugin.settings);
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
            await this.plugin.saveData(this.plugin.settings);
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
            await this.plugin.saveData(this.plugin.settings);
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
            await this.plugin.saveData(this.plugin.settings);
          })
      );
  }
}
