import {
  App,
  Modal,
  Setting,
  TextComponent,
  ToggleComponent,
  DropdownComponent,
} from 'obsidian';
import { ParsedTask } from './parser';
import { PluginSettings } from './settings';

export interface EditTaskResult {
  text: string;
  checked: boolean;
}

interface ParsedContent {
  title: string;
  metas: Map<string, string>;
  tags: string[];
  deps: { dependsOn: string[]; subtaskOf: string[]; after: string[] };
}

function parseTaskContent(text: string): ParsedContent {
  const metas = new Map<string, string>();
  const tags: string[] = [];
  const deps = {
    dependsOn: [] as string[],
    subtaskOf: [] as string[],
    after: [] as string[],
  };
  let title = text;

  title = title.replace(/\[dependsOn::\s*([^\]]+)\]/g, (_m, v) => {
    deps.dependsOn.push(v.trim());
    return '';
  });
  title = title.replace(/\[subtaskOf::\s*([^\]]+)\]/g, (_m, v) => {
    deps.subtaskOf.push(v.trim());
    return '';
  });
  title = title.replace(/\[after::\s*([^\]]+)\]/g, (_m, v) => {
    deps.after.push(v.trim());
    return '';
  });

  title = title.replace(/\[(\w+)::\s*([^\]]+)\]/g, (_m, key, val) => {
    const k = key.toLowerCase();
    if (k === 'id') return '';
    metas.set(key, val.trim());
    return '';
  });
  title = title.replace(
    /\b(\w+)::\s*((?:\[\[[^\]]+\]\]|[^\n])*?)(?=\s+\w+::|\s+#|$)/g,
    (_m, key, val) => {
      const k = key.toLowerCase();
      if (k === 'id') return '';
      metas.set(key, val.trim());
      return '';
    },
  );
  title = title.replace(/#(\S+)/g, (_m, t) => {
    tags.push('#' + t);
    return '';
  });
  const idMatch = title.trim().match(/\^[\w-]+$/);
  if (idMatch) {
    title = title.replace(/\^[\w-]+$/, '');
  }
  return { title: title.trim(), metas, tags, deps };
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
): Promise<EditTaskResult | null> {
  const { title, metas, tags, deps } = parseTaskContent(task.text);
  return new Promise((resolve) => {
    new (class extends Modal {
      titleInput!: TextComponent;
      tagsInput!: TextComponent;
      start!: TextComponent;
      scheduled!: TextComponent;
      due!: TextComponent;
      done!: TextComponent;
      recur!: TextComponent;
      priority!: DropdownComponent;
      checked!: ToggleComponent;

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
              .onClick(() => {
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

                const text = buildTaskText(
                  title,
                  newMetas,
                  newTags,
                  settings,
                  task.blockId,
                  deps,
                );
                resolve({ text, checked });
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
    })(app).open();
  });
}


