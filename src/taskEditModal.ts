import { App, Modal, Setting, TextComponent, ToggleComponent, DropdownComponent } from 'obsidian';
import { ParsedTask } from './parser';
import { PluginSettings } from './settings';

export interface EditTaskResult {
  text: string;
  checked: boolean;
}

function parseTaskContent(text: string) {
  const metas = new Map<string, string>();
  const tags: string[] = [];
  let description = text;

  description = description.replace(/\[(\w+)::\s*([^\]]+)\]/g, (_m, key, val) => {
    metas.set(key, val.trim());
    return '';
  });
  description = description.replace(
    /\b(\w+)::\s*((?:\[\[[^\]]+\]\]|[^\n])*?)(?=\s+\w+::|\s+#|$)/g,
    (_m, key, val) => {
      metas.set(key, val.trim());
      return '';
    },
  );
  description = description.replace(/#(\S+)/g, (_m, t) => {
    tags.push('#' + t);
    return '';
  });
  const idMatch = description.trim().match(/\^[\w-]+$/);
  if (idMatch) {
    metas.set('ID', idMatch[0].slice(1));
    description = description.replace(/\^[\w-]+$/, '');
  }
  return { description: description.trim(), metas, tags };
}

function buildTaskText(
  desc: string,
  metas: Map<string, string>,
  tags: string[],
  settings: PluginSettings,
  id: string,
) {
  const parts: string[] = [];
  if (desc) parts.push(desc.trim());
  tags.forEach((t) => {
    if (!t) return;
    const tag = t.startsWith('#') ? t : '#' + t;
    parts.push(tag);
  });
  metas.forEach((v, k) => {
    if (k === 'ID') return;
    parts.push(`${k}:: ${v}`);
  });
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
  const { description, metas, tags } = parseTaskContent(task.text);
  return new Promise((resolve) => {
    new (class extends Modal {
      desc!: TextComponent;
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
          .setName('Description')
          .addText((t) => (this.desc = t.setValue(description)));
        new Setting(contentEl)
          .setName('Tags')
          .addText((t) => (this.tagsInput = t.setValue(tags.join(' '))));
        new Setting(contentEl)
          .setName('Start')
          .addText((t) => (this.start = t.setValue(metas.get('start') || '')));
        new Setting(contentEl)
          .setName('Scheduled')
          .addText((t) => (this.scheduled = t.setValue(metas.get('scheduled') || '')));
        new Setting(contentEl)
          .setName('Due')
          .addText((t) => (this.due = t.setValue(metas.get('due') || '')));
        new Setting(contentEl)
          .setName('Done')
          .addText((t) => (this.done = t.setValue(metas.get('done') || '')));
        new Setting(contentEl)
          .setName('Recurrence')
          .addText((t) =>
            (this.recur = t.setValue(
              metas.get('recurrence') || metas.get('repeat') || '',
            )),
          );
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
                const desc = this.desc.getValue().trim();
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
                  desc,
                  newMetas,
                  newTags,
                  settings,
                  task.blockId,
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


