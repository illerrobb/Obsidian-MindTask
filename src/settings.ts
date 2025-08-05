import { App, PluginSettingTab, Setting } from 'obsidian';
import MindTaskPlugin from './main';

export interface BoardInfo {
  name: string;
  path: string;
}

export interface ColorOption {
  color: string;
  /**
   * Optional tag or field label that triggers this color.
   * Use "#tag" to match a tag or "field:: value" for a metadata field.
   */
  label?: string;
}

export interface PluginSettings {
  defaultTaskFile: string;
  tagFilters: string[];
  folderPaths: string[];
  /** Use ^id block anchors rather than [id:: ] inline fields */
  useBlockId: boolean;
  /** Delete tasks from files instead of marking them as [-] */
  deletePermanently: boolean;
  /** Folder to store board files */
  boardFolder: string;
  /** List of background colors for tasks */
  backgroundColors: ColorOption[];
  /** Horizontal spacing between nodes when rearranging */
  rearrangeSpacingX: number;
  /** Vertical spacing between nodes when rearranging */
  rearrangeSpacingY: number;
  /** Orientation of node layout */
  orientation: 'vertical' | 'horizontal';
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
  deletePermanently: false,
  boardFolder: '',
  backgroundColors: [
    { color: 'red' },
    { color: 'green' },
    { color: 'blue' },
    { color: 'yellow' },
  ],
  rearrangeSpacingX: 40,
  rearrangeSpacingY: 40,
  orientation: 'vertical',
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
            .setPlaceholder('tasks.mtask')
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
            this.plugin.boards.push({ name: 'New Board', path: 'tasks.mtask' });
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

    new Setting(containerEl)
      .setName('Delete tasks permanently')
      .setDesc('When disabled, tasks are marked as [-] instead of removed')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deletePermanently)
          .onChange(async (value) => {
            this.plugin.settings.deletePermanently = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName('Horizontal node spacing')
      .setDesc('Spacing between sibling nodes when rearranging')
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setPlaceholder('40')
          .setValue(this.plugin.settings.rearrangeSpacingX.toString())
          .onChange(async (value) => {
            const num = parseInt(value) || 0;
            this.plugin.settings.rearrangeSpacingX = num;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName('Vertical node spacing')
      .setDesc('Spacing between levels when rearranging')
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setPlaceholder('40')
          .setValue(this.plugin.settings.rearrangeSpacingY.toString())
          .onChange(async (value) => {
            const num = parseInt(value) || 0;
            this.plugin.settings.rearrangeSpacingY = num;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName('Orientation')
      .setDesc('Direction for arranged nodes')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('vertical', 'Vertical')
          .addOption('horizontal', 'Horizontal')
          .setValue(this.plugin.settings.orientation)
          .onChange(async (value) => {
            this.plugin.settings.orientation = value as 'vertical' | 'horizontal';
            await this.plugin.savePluginData();
          })
      );

    containerEl.createEl('h2', { text: 'Background colors' });
    const colorsEl = containerEl.createDiv();

    const renderColors = () => {
      colorsEl.empty();
      this.plugin.settings.backgroundColors.forEach((c, i) => {
        const setting = new Setting(colorsEl);
        const preview = setting.controlEl.createEl('span');
        preview.style.display = 'inline-block';
        preview.style.width = '1em';
        preview.style.height = '1em';
        preview.style.marginRight = '8px';
        preview.style.backgroundColor = c.color;
        setting
          .addText((text) =>
            text
              .setPlaceholder('Color')
              .setValue(c.color)
              .onChange(async (v) => {
                c.color = v.trim();
                preview.style.backgroundColor = c.color;
                await this.plugin.savePluginData();
              })
          )
          // "Label" accepts either a tag (e.g. "#next") or a field
          // in the form "status:: done". Tasks containing the label
          // automatically use this color.
          .addText((text) =>
            text
              .setPlaceholder('Label (e.g. #tag or key:: value)')
              .setValue(c.label ?? '')
              .onChange(async (v) => {
                c.label = v.trim() || undefined;
                await this.plugin.savePluginData();
              })
          )
          .addExtraButton((btn) =>
            btn
              .setIcon('trash')
              .setTooltip('Delete')
              .onClick(async () => {
                this.plugin.settings.backgroundColors.splice(i, 1);
                await this.plugin.savePluginData();
                renderColors();
              })
          );
      });
    };

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText('Add color')
          .setCta()
          .onClick(async () => {
            this.plugin.settings.backgroundColors.push({ color: '#ffffff' });
            await this.plugin.savePluginData();
            renderColors();
          })
      );

    renderColors();
  }
}
