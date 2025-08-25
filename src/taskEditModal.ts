import {
  App,
  Modal,
  Setting,
  TextComponent,
  TextAreaComponent,
  ToggleComponent,
  DropdownComponent,
  normalizePath,
} from 'obsidian';
import { NoteSuggest } from './noteSuggest';
import WikiLinkSuggest from './wikiLinkSuggest';
import { ParsedTask } from './parser';
import { PluginSettings } from './settings';
import { parseTaskContent } from './taskContent';

export interface EditTaskResult {
  text: string;
  checked: boolean;
  description: string;
  notePath?: string;
}

function buildTaskText(
  title: string,
  metas: Map<string, string>,
  tags: string[],
  settings: PluginSettings,
  id: string,
  deps: { dependsOn: string[]; subtaskOf: string[]; after: string[] },
) {
  const parts: string[] = [];
  if (title) parts.push(title.trim());
  tags.forEach((t) => {
    if (!t) return;
    const tag = t.startsWith('#') ? t : '#' + t;
    parts.push(tag);
  });
  metas.forEach((v, k) => {
    if (k === 'ID' || k.toLowerCase() === 'id') return;
    parts.push(`[${k}:: ${v}]`);
  });
  deps.dependsOn.forEach((v) => parts.push(`[dependsOn:: ${v}]`));
  deps.subtaskOf.forEach((v) => parts.push(`[subtaskOf:: ${v}]`));
  deps.after.forEach((v) => parts.push(`[after:: ${v}]`));
  if (settings.useBlockId) {
    parts.push(`^${id}`);
  } else {
    parts.push(`[id:: ${id}]`);
  }
  return parts.join('  ').trim();
}

export async function openTaskEditModal(
  app: App,
  task: ParsedTask,
  settings: PluginSettings,
  createDetailedNote?: (taskId: string) => Promise<string | null>,
): Promise<EditTaskResult | null> {
  const { title, metas, tags, deps } = parseTaskContent(task.text);
  metas.delete('description');
  return new Promise((resolve) => {
    new (class extends Modal {
      constructor(
        app: App,
        private createDetailedNote?: (taskId: string) => Promise<string | null>,
      ) {
        super(app);
      }
      titleInput!: TextComponent;
      tagsInput!: TextComponent;
      start!: TextComponent;
      scheduled!: TextComponent;
      due!: TextComponent;
      done!: TextComponent;
      recur!: TextComponent;
      priority!: DropdownComponent;
      checked!: ToggleComponent;
      description!: TextAreaComponent;
      notePath!: TextComponent;

      onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Edit Task' });
        new Setting(contentEl)
          .setName('Title')
          .addText((t) => (this.titleInput = t.setValue(title)));
        new Setting(contentEl)
          .setName('Tags')
          .addText((t) => (this.tagsInput = t.setValue(tags.join(' '))));
        new Setting(contentEl)
          .setName('Description')
          .addTextArea((t) => {
            this.description = t.setValue(task.description || '');
            new WikiLinkSuggest(app, t.inputEl);
          });
        new Setting(contentEl)
          .setName('Note Path')
          .addText((t) => {
            this.notePath = t.setValue(metas.get('notePath') || '');
            new NoteSuggest(app, t.inputEl);
          })
          .addExtraButton((btn) =>
            btn
              .setIcon('file')
              .setTooltip('Open or create note')
              .onClick(async () => {
                const path = this.notePath.getValue().trim();
                if (!path) return;
                const normalized = normalizePath(path);
                let file = this.app.vault.getAbstractFileByPath(normalized) as any;
                if (!file) {
                  file = await this.app.vault.create(normalized, '');
                }
                await this.app.workspace.openLinkText(normalized, '', false);
              }),
          )
          .addExtraButton((btn) =>
            btn
              .setIcon('file-plus')
              .setTooltip('Create detailed note')
              .onClick(async () => {
                if (!this.createDetailedNote) return;
                const newPath = await this.createDetailedNote(task.blockId);
                if (newPath) {
                  this.notePath.setValue(newPath);
                  await this.app.workspace.openLinkText(newPath, '', false);
                }
              }),
          );
        new Setting(contentEl)
          .setName('Start')
          .addText((t) => {
            this.start = t.setValue(metas.get('start') || '');
            this.start.inputEl.type = 'date';
          });
        new Setting(contentEl)
          .setName('Scheduled')
          .addText((t) => {
            this.scheduled = t.setValue(metas.get('scheduled') || '');
            this.scheduled.inputEl.type = 'date';
          });
        new Setting(contentEl)
          .setName('Due')
          .addText((t) => {
            this.due = t.setValue(metas.get('due') || '');
            this.due.inputEl.type = 'date';
          });
        new Setting(contentEl)
          .setName('Done')
          .addText((t) => {
            this.done = t.setValue(metas.get('done') || '');
            this.done.inputEl.type = 'date';
          });
        new Setting(contentEl)
          .setName('Recurrence')
          .addText((t) =>
            (this.recur = t.setValue(
              metas.get('recurrence') || metas.get('repeat') || '',
            )).setPlaceholder('e.g. every week'),
          );
        const depStrings: string[] = [];
        if (deps.dependsOn.length)
          depStrings.push(`Depends on: ${deps.dependsOn.join(', ')}`);
        if (deps.subtaskOf.length)
          depStrings.push(`Subtask of: ${deps.subtaskOf.join(', ')}`);
        if (deps.after.length)
          depStrings.push(`After: ${deps.after.join(', ')}`);
        if (depStrings.length)
          new Setting(contentEl)
            .setName('Dependencies')
            .setDesc(depStrings.join(' | '));
        new Setting(contentEl)
          .setName('Priority')
          .addDropdown((d) =>
            (this.priority = d
              .addOption('', 'None')
              .addOption('low', 'Low')
              .addOption('medium', 'Medium')
              .addOption('high', 'High')
              .setValue(metas.get('priority') || '')),
          );
        new Setting(contentEl)
          .setName('Completed')
          .addToggle((t) => (this.checked = t.setValue(task.checked)));
        new Setting(contentEl)
          .addButton((btn) =>
            btn
              .setButtonText('Save')
              .setCta()
              .onClick(async () => {
                const newMetas = new Map(metas);
                const title = this.titleInput.getValue().trim();
                const tagStr = this.tagsInput.getValue().trim();
                const newTags = tagStr
                  ? tagStr
                      .split(/\s+/)
                      .map((tg) => (tg.startsWith('#') ? tg : '#' + tg))
                  : [];
                const start = this.start.getValue().trim();
                const scheduled = this.scheduled.getValue().trim();
                const due = this.due.getValue().trim();
                const done = this.done.getValue().trim();
                const recur = this.recur.getValue().trim();
                const prio = this.priority.getValue();
                const checked = this.checked.getValue();
                const desc = this.description.getValue().trim();
                const note = this.notePath.getValue().trim();

                start ? newMetas.set('start', start) : newMetas.delete('start');
                scheduled
                  ? newMetas.set('scheduled', scheduled)
                  : newMetas.delete('scheduled');
                due ? newMetas.set('due', due) : newMetas.delete('due');
                done ? newMetas.set('done', done) : newMetas.delete('done');
                recur
                  ? newMetas.set('recurrence', recur)
                  : newMetas.delete('recurrence');
                prio ? newMetas.set('priority', prio) : newMetas.delete('priority');
                newMetas.delete('description');
                note
                  ? newMetas.set('notePath', note)
                  : newMetas.delete('notePath');

                const text = buildTaskText(
                  title,
                  newMetas,
                  newTags,
                  settings,
                  task.blockId,
                  deps,
                );
                if (note) {
                  const normalized = normalizePath(note);
                  let file = this.app.vault.getAbstractFileByPath(normalized) as any;
                  if (!file) {
                    file = await this.app.vault.create(normalized, desc);
                  } else {
                    await this.app.vault.modify(file, desc);
                  }
                }
                resolve({ text, checked, description: desc, notePath: note || undefined });
                this.close();
              }),
          )
          .addExtraButton((btn) =>
            btn
              .setIcon('cross')
              .setTooltip('Cancel')
              .onClick(() => {
                resolve(null);
                this.close();
              }),
          );
      }

      onClose() {
        this.contentEl.empty();
      }
    })(app, createDetailedNote).open();
  });
}


