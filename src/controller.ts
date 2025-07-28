import { App, normalizePath, TFile } from 'obsidian';
import crypto from 'crypto';
import { BoardData, NodeData, saveBoard } from './boardStore';
import { ParsedTask } from './parser';
import { PluginSettings } from './settings';

export default class Controller {
  constructor(
    private app: App,
    private boardFile: TFile,
    private board: BoardData,
    private tasks: Map<string, ParsedTask>,
    private settings: PluginSettings
  ) {}

  async moveNode(id: string, x: number, y: number) {
    if (!this.board.nodes[id]) return;
    this.board.nodes[id] = { ...this.board.nodes[id], x, y } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async resizeNode(id: string, width: number, height: number) {
    if (!this.board.nodes[id]) return;
    this.board.nodes[id] = {
      ...this.board.nodes[id],
      width,
      height,
    } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async createTask(
    text: string,
    x: number,
    y: number,
    filePath = this.settings.defaultTaskFile
  ) {
    const path = normalizePath(filePath);
    let file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      file = await this.app.vault.create(path, '');
    }
    const id = 't-' + crypto.randomBytes(4).toString('hex');
    await this.app.vault.append(file, `- [ ] ${text} ^${id}\n`);
    const content = await this.app.vault.read(file);
    const line = content.split(/\r?\n/).length - 1;
    const task: ParsedTask = {
      file,
      line,
      text,
      checked: false,
      blockId: id,
      indent: 0,
      dependsOn: [],
    };
    this.tasks.set(id, task);
    this.board.nodes[id] = { x, y } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
    return id;
  }

  async openTask(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    await this.app.workspace.openLinkText(
      `${task.file.path}#^${task.blockId}`,
      '',
      true
    );
  }

  async toggleCheck(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    await this.setCheck(id, !task.checked);
  }

  async setCheck(id: string, checked: boolean) {
    const task = this.tasks.get(id);
    if (!task) return;
    const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
    const line = lines[task.line];
    const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
    if (!m) return;
    const indent = m[1];
    const rest = m[3];
    lines[task.line] = `${indent}- [${checked ? 'x' : ' '}] ${rest}`;
    await this.app.vault.modify(task.file, lines.join('\n'));
    task.checked = checked;
  }

  async setNodeColor(id: string, color: string | null) {
    if (!this.board.nodes[id]) return;
    const data: NodeData = { ...this.board.nodes[id] } as NodeData;
    if (color) {
      data.color = color;
    } else {
      delete (data as any).color;
    }
    this.board.nodes[id] = data;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async groupNodes(ids: string[], name: string) {
    if (!ids.length) return;
    const id = 'g-' + crypto.randomBytes(4).toString('hex');
    const posX = ids.reduce((s, i) => s + (this.board.nodes[i]?.x || 0), 0) / ids.length;
    const posY = ids.reduce((s, i) => s + (this.board.nodes[i]?.y || 0), 0) / ids.length;
    this.board.nodes[id] = { x: posX, y: posY, type: 'group', name, members: ids } as NodeData;
    ids.forEach((nid) => {
      if (this.board.nodes[nid]) {
        (this.board.nodes[nid] as NodeData).group = id;
      }
    });
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async ungroupNode(id: string) {
    const node = this.board.nodes[id];
    if (!node || node.type !== 'group' || !node.members) return;
    node.members.forEach((nid) => {
      if (this.board.nodes[nid]) {
        delete (this.board.nodes[nid] as any).group;
      }
    });
    delete this.board.nodes[id];
    await saveBoard(this.app, this.boardFile, this.board);
  }

  private async modifyTaskText(task: ParsedTask, fn: (text: string) => string) {
    const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
    const line = lines[task.line];
    const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
    if (!m) return;
    const indent = m[1];
    const checked = m[2];
    let text = m[3];
    text = fn(text);
    lines[task.line] = `${indent}- [${checked}] ${text}`;
    await this.app.vault.modify(task.file, lines.join('\n'));
    task.text = text;
  }

  private relationString(type: string, from: ParsedTask, to: ParsedTask) {
    const target = `[[${to.file.path}#^${to.blockId}]]`;
    switch (type) {
      case 'depends':
        return `dependsOn:: ${target}`;
      case 'subtask':
        return `subtaskOf:: ${target}`;
      case 'sequence':
        return `after:: ${target}`;
      default:
        return '';
    }
  }

  private async applyRelation(type: string, from: ParsedTask, to: ParsedTask) {
    const rel = this.relationString(type, from, to);
    if (!rel) return;
    const insertRel = (t: string) => {
      if (t.includes(rel)) return t;
      const match = t.match(/\^([\w-]+)$/);
      if (match) {
        return t.replace(/\^([\w-]+)$/, `${rel} ^$1`);
      }
      return `${t} ${rel}`;
    };
    await this.modifyTaskText(to, insertRel);
  }

  private async removeRelation(type: string, from: ParsedTask, to: ParsedTask) {
    const rel = this.relationString(type, from, to);
    if (!rel) return;
    const re = new RegExp(`\\s*${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    await this.modifyTaskText(to, (t) => t.replace(re, ''));
  }

  async createEdge(from: string, to: string, type: string) {
    const fromTask = this.tasks.get(from);
    const toTask = this.tasks.get(to);
    if (!fromTask || !toTask) return;
    await this.applyRelation(type, fromTask, toTask);
    this.board.edges.push({ from, to, type });
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async cycleEdgeType(index: number) {
    const edge = this.board.edges[index];
    if (!edge) return;
    const types = ['depends', 'subtask', 'sequence'];
    const current = types.indexOf(edge.type);
    const next = types[(current + 1) % types.length];
    const fromTask = this.tasks.get(edge.from);
    const toTask = this.tasks.get(edge.to);
    if (!fromTask || !toTask) return;
    await this.removeRelation(edge.type, fromTask, toTask);
    await this.applyRelation(next, fromTask, toTask);
    edge.type = next;
    await saveBoard(this.app, this.boardFile, this.board);
  }
}
