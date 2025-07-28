import { App, PluginSettingTab, Setting } from 'obsidian';
import VisualTasksPlugin from './main';

export interface PluginSettings {
  boardFilePath: string;
  defaultTaskFile: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  boardFilePath: 'tasks.vtasks.json',
  defaultTaskFile: 'Tasks.md',
};

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: VisualTasksPlugin) {
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
  }
}
