import { App, PluginSettingTab, Setting } from 'obsidian';
import MindTaskPlugin from './main';

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
  /** Default description mode for new tasks */
  defaultDescriptionMode: 'short' | 'note';
  /** Folder to store detailed task notes */
  notesFolder: string;
  /** Template file used when creating detailed notes */
  templatePath: string;
  /** List of background colors for tasks */
  backgroundColors: ColorOption[];
  /** Horizontal spacing between nodes when rearranging */
  rearrangeSpacingX: number;
  /** Vertical spacing between nodes when rearranging */
  rearrangeSpacingY: number;
  /** Color for alignment guide lines (empty for theme accent) */
  alignLineColor: string;
  /** Width of alignment guide lines in pixels */
  alignLineWidth: number;
}

export interface PluginData {
  settings: PluginSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultTaskFile: 'Tasks.md',
  tagFilters: [],
  folderPaths: [],
  useBlockId: true,
  deletePermanently: false,
  boardFolder: '',
  defaultDescriptionMode: 'short',
  notesFolder: '',
  templatePath: 'Templates/task-note.md',
  backgroundColors: [
    { color: 'red' },
    { color: 'green' },
    { color: 'blue' },
    { color: 'yellow' },
  ],
  rearrangeSpacingX: 40,
  rearrangeSpacingY: 40,
  alignLineColor: '',
  alignLineWidth: 1,
};

export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: MindTaskPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
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
      .setName('Default description mode')
      .setDesc(
        'Choose whether new tasks use a short description or a detailed note',
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption('short', 'Brief only')
          .addOption('note', 'With detailed note')
          .setValue(this.plugin.settings.defaultDescriptionMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultDescriptionMode = value as
              'short' | 'note';
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName('Notes folder')
      .setDesc('Folder where detailed notes are stored')
      .addText((text) =>
        text
          .setPlaceholder('(same as task file)')
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value.trim();
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName('Note template')
      .setDesc('Template file for detailed notes')
      .addText((text) =>
        text
          .setPlaceholder('Templates/task-note.md')
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            this.plugin.settings.templatePath = value.trim();
            await this.plugin.savePluginData();
          }),
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

    containerEl.createEl('h2', { text: 'Alignment guides' });

    new Setting(containerEl)
      .setName('Line color')
      .setDesc('CSS color for alignment lines; leave empty for theme accent')
      .addText((text) =>
        text
          .setPlaceholder('var(--color-accent)')
          .setValue(this.plugin.settings.alignLineColor)
          .onChange(async (value) => {
            this.plugin.settings.alignLineColor = value.trim();
            await this.plugin.savePluginData();
            this.plugin.applyAlignLineStyles();
          })
      );

    new Setting(containerEl)
      .setName('Line width')
      .setDesc('Thickness of alignment lines in pixels')
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setPlaceholder('1')
          .setValue(this.plugin.settings.alignLineWidth.toString())
          .onChange(async (value) => {
            const num = parseInt(value) || 1;
            this.plugin.settings.alignLineWidth = num;
            await this.plugin.savePluginData();
            this.plugin.applyAlignLineStyles();
          });
      });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText('Reset')
        .onClick(async () => {
          this.plugin.settings.alignLineColor = '';
          this.plugin.settings.alignLineWidth = 1;
          await this.plugin.savePluginData();
          this.plugin.applyAlignLineStyles();
          this.display();
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
